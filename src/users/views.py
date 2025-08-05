from django.core.paginator import Paginator
from django.http import JsonResponse
from django.shortcuts import redirect
from django.utils.decorators import method_decorator
from django.views import View
from django.db.models import Q, Count, Max, Avg
from django.views.decorators.csrf import csrf_exempt

from ThreatDetection.models import CustomUser, ActivityLogs, Alerts
from src.dashboard.forms import DateRangeForm
from django.utils.timezone import now, timedelta
import json
from src.mlengine.utils import my_get_object_or_404


class CustomUserView(View):
    def get(self, request):
        search = request.GET.get('search', '')
        sort = request.GET.get('sort', '')
        show_suspended = request.GET.get('suspended', 'false') == 'true'
        page_number = int(request.GET.get('page', 1))
        page_size = int(request.GET.get('limit', 8))

        users = CustomUser.objects.all()

        if not show_suspended:
            users = users.filter(is_suspended=False)

        if search:
            users = users.filter(
                Q(username__icontains=search) |
                Q(department__icontains=search) |
                Q(role__icontains=search)
            )

        users = users.annotate(
            threat_count=Count('activitylogs', filter=Q(activitylogs__is_suspicious=True)),
            last_threat_time=Max('activitylogs__timestamp', filter=Q(activitylogs__is_suspicious=True))
        )

        if sort == 'a-z':
            users = users.order_by('username')
        elif sort == 'z-a':
            users = users.order_by('-username')
        elif sort == 'most-threats':
            users = users.order_by('-threat_count')
        elif sort == 'recent-threat':
            users = users.order_by('-last_threat_time')

        paginator = Paginator(users, page_size)
        page = paginator.get_page(page_number)

        user_list = [{
            'id': user.id,
            'username': user.username,
            'email': user.email,
            'department': user.department,
            'role': user.role,
            'is_suspended': user.is_suspended,
            'created_at': user.created_at.strftime('%Y-%m-%d %H:%M:%S'),
            'threat_count': user.threat_count,
            'last_threat_time': user.last_threat_time.strftime('%Y-%m-%d %H:%M:%S') if user.last_threat_time else ''
        } for user in page.object_list]

        return JsonResponse({
            'users': user_list,
            'current_page': page_number,
            'total_pages': paginator.num_pages,
            'total_users': paginator.count
        })


class UserDetailView(View):
    def get(self, request, user_id):
        try:

            form = DateRangeForm(request.GET)
            if not form.is_valid():
                return JsonResponse({'error': form.errors}, status=400)

            start_date = form.cleaned_data.get('start_date')
            end_date = form.cleaned_data.get('end_date')

            if not start_date and not end_date:
                end_date = now().date()
                start_date = end_date - timedelta(days=1)
            elif start_date and not end_date:
                end_date = now().date()
            elif end_date and not start_date:
                start_date = end_date - timedelta(days=1)

            date_range_days = (end_date - start_date).days
            if date_range_days <= 1:
                group_by = 'hour'
            elif date_range_days <= 7:
                group_by = 'day'
            elif date_range_days <= 90:
                group_by = 'week'
            else:
                group_by = 'month'


            user = CustomUser.objects.annotate(
                threat_count=Count('activitylogs', filter=Q(activitylogs__is_suspicious=True)),
                last_threat_time=Max('activitylogs__timestamp', filter=Q(activitylogs__is_suspicious=True))
            ).get(id=user_id)

            user_data = {
                'id': user.id,
                'username': user.username,
                'department': user.department,
                'role': user.role,
                'email': user.email,
                'is_suspended': user.is_suspended,
                'created_at': user.created_at.strftime('%Y-%m-%d %H:%M:%S'),
                'threat_count': user.threat_count,
                'last_threat_time': user.last_threat_time.strftime('%Y-%m-%d %H:%M:%S') if user.last_threat_time else '',
                'failed_login_timestamp': user.failed_login_timestamp.strftime('%Y-%m-%d %H:%M:%S') if user.failed_login_timestamp else ''
            }

            #  Alert points (line chart)
            alerts_qs = (
                Alerts.objects
                .filter(log__user_id=user_id, log__timestamp__date__range=(start_date, end_date))
                .select_related('log')
                .order_by('log__timestamp')
            )
            alert_points = [
                {
                    'timestamp': alert.log.timestamp.strftime('%Y-%m-%d %H:%M'),
                    'score': round(alert.score, 2),
                    'user': user.username,
                    'reason': alert.log.activity_type or 'No reason'
                }
                for alert in alerts_qs
            ]

            #  Pie chart (activity types)
            pie_qs = (
                ActivityLogs.objects
                .filter(user_id=user_id, is_suspicious=True, timestamp__date__range=(start_date, end_date))
                .values('activity_type')
                .annotate(count=Count('id'))
                .order_by('-count')[:5]
            )
            pie_labels = [entry['activity_type'] for entry in pie_qs]
            pie_counts = [entry['count'] for entry in pie_qs]

            # ✅ Bar chart (just for this user)
            bar_qs = (
                Alerts.objects
                .filter(log__user_id=user_id, log__timestamp__date__range=(start_date, end_date))
                .values('log__user__username')
                .annotate(avg_score=Avg('score'), activity_count=Count('id'))
            )
            bar_labels = [entry['log__user__username'] or 'Unknown' for entry in bar_qs]
            bar_scores = [round(entry['avg_score'], 2) for entry in bar_qs]
            bar_counts = [entry['activity_count'] for entry in bar_qs]

            return JsonResponse({
                'user': user_data,
                'alertPoints': alert_points,
                'pieLabels': pie_labels,
                'pieData': pie_counts,
                'barLabels': bar_labels,
                'barScores': bar_scores,
                'barCounts': bar_counts,
                'startDateUsed': str(start_date),
                'endDateUsed': str(end_date),
                'groupBy': group_by,
            })

        except CustomUser.DoesNotExist:
            return JsonResponse({'error': 'User not found'}, status=404)
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=500)

@method_decorator(csrf_exempt, name='dispatch')
class SuspendUserView(View):
    def put(self, request, user_id):
        try:
            user = my_get_object_or_404(CustomUser, id=user_id)
            data = json.loads(request.body)
            user.is_suspended = data.get("is_suspended", False)
            user.save()
            return JsonResponse({'success': True})
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=400)


class DeleteUserView(View):

    def delete(self, request, user_id):
        user = my_get_object_or_404(CustomUser, id=user_id)
        user.delete()
        return redirect('user-detail', user_id=user_id)