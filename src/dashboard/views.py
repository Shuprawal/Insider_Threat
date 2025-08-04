

from django.db.models import Count, Avg
from django.db.models.functions import TruncHour, TruncDay, TruncWeek, TruncMonth
from django.http import JsonResponse
from django.utils.timezone import now, timedelta
from django.shortcuts import render
from django.utils.timezone import now
from django.views import View
import datetime
from ThreatDetection.models import Alerts, ActivityLogs
from .forms import *

# Create your views here.



class DashboardView(View):
    # def get(self, request):
    #     try:
    #         # Parse optional date parameters from query string
    #         start_date_str = request.GET.get('start_date')
    #         end_date_str = request.GET.get('end_date')
    #
    #         today = now().date()
    #         if start_date_str:
    #             print('start_date_str', start_date_str)
    #
    #             start_date = datetime.datetime.strptime(start_date_str, "%Y-%m-%d").date()
    #         else:
    #             start_date = today
    #
    #         if end_date_str:
    #             end_date = datetime.datetime.strptime(end_date_str, "%Y-%m-%d").date()
    #         else:
    #             end_date = today
    #
    #         # Filter by date range (inclusive)
    #         date_range_filter = {
    #             'log__timestamp__date__range': (start_date, end_date)
    #         }
    #         top_threat_users_qs = (
    #             ActivityLogs.objects
    #             .filter(is_suspicious=True, timestamp__date__range=(start_date, end_date))
    #             .values('user__username')
    #             .annotate(count=Count('id'))
    #             .order_by('-count')[:5]
    #         )
    #         top_threat_users = [
    #             {'username': entry['user__username'] or 'Unknown', 'count': entry['count']}
    #             for entry in top_threat_users_qs
    #         ]
    #
    #         # Hour Tooltip Details
    #         hour_details_qs = (
    #             Alerts.objects
    #             .filter(**date_range_filter)
    #             .values('log__timestamp__hour', 'log__user__username', 'log__activity_type')
    #             .annotate(avg_score=Avg('score'))
    #             .order_by('log__timestamp__hour')
    #         )
    #
    #         hour_details = []
    #         for entry in hour_details_qs:
    #             hour_str = f"{entry['log__timestamp__hour']:02}:00"
    #             hour_details.append({
    #                 'hour': hour_str,
    #                 'user': entry['log__user__username'] or 'Unknown',
    #                 'reason': entry['log__activity_type'] or 'No reason'
    #             })
    #
    #         # Line Chart — Hourly Threat Confidence Score
    #         hourly_scores = (
    #             Alerts.objects
    #             .filter(**date_range_filter)
    #             .annotate(hour=Count('log__timestamp__hour'))
    #             .values('log__timestamp__hour')
    #             .annotate(avg_score=Avg('score'))
    #             .order_by('log__timestamp__hour')
    #         )
    #
    #         all_hours = [f"{h:02}:00" for h in range(24)]
    #         hour_score_map = {
    #             f"{entry['log__timestamp__hour']:02}:00": round(entry['avg_score'], 2)
    #             for entry in hourly_scores
    #         }
    #         hour_scores = [hour_score_map.get(hour, 0) for hour in all_hours]
    #
    #         # Pie Chart — Top Suspicious Activities
    #         pie_data = (
    #             ActivityLogs.objects
    #             .filter(is_suspicious=True, timestamp__date__range=(start_date, end_date))
    #             .values('activity_type')
    #             .annotate(count=Count('id'))
    #             .order_by('-count')[:5]
    #         )
    #         pie_labels = [entry['activity_type'] for entry in pie_data]
    #         pie_counts = [entry['count'] for entry in pie_data]
    #
    #         # bargraph
    #
    #         threat_users = (
    #             Alerts.objects
    #             .filter(log__user__isnull=False, **date_range_filter)
    #             .values('log__user__username')
    #             .annotate(avg_score=Avg('score'), activity_count=Count('id'))
    #             .order_by('-avg_score')[:5]
    #         )
    #
    #         bar_labels = [entry['log__user__username'] or 'Unknown' for entry in threat_users]
    #         bar_scores = [round(entry['avg_score'], 2) for entry in threat_users]
    #         bar_counts = [entry['activity_count'] for entry in threat_users]
    #
    #         return JsonResponse({
    #             'hourLabels': all_hours,
    #             'hourScores': hour_scores,
    #             'pieLabels': pie_labels,
    #             'pieData': pie_counts,
    #             'barLabels': bar_labels,
    #             'barScores': bar_scores,
    #             'barCounts': bar_counts,
    #             'topThreatUsers': top_threat_users,
    #             'hourDetails': hour_details,
    #             'startDateUsed': str(start_date),
    #             'endDateUsed': str(end_date)
    #         })
    #
    #     except Exception as e:
    #         return JsonResponse({'error': str(e)}, status=400)

    def get(self, request):
        try:
            form = DateRangeForm(request.GET)
            if not form.is_valid():
                print('Form errors:', form.errors)
                return JsonResponse({'error': form.errors}, status=400)

            # ✅ Extract cleaned values
            start_date = form.cleaned_data.get('start_date')
            end_date = form.cleaned_data.get('end_date')

            # ✅ Default to last 24 hours if both are missing
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
                truncate_fn = TruncHour
                time_format = "%Y-%m-%d %H:00"
            elif date_range_days <= 7:
                group_by = 'day'
                truncate_fn = TruncDay
                time_format = "%Y-%m-%d"
            elif date_range_days <= 90:
                group_by = 'week'
                truncate_fn = TruncWeek
                time_format = "Week %W, %Y"
            else:
                group_by = 'month'
                truncate_fn = TruncMonth
                time_format = "%B %Y"

            # Query for grouped alert scores
            grouped_scores = (
                Alerts.objects
                .filter(log__timestamp__date__range=(start_date, end_date))
                .annotate(period=truncate_fn('log__timestamp'))
                .values('period')
                .annotate(avg_score=Avg('score'))
                .order_by('period')
            )

            line_labels = [entry['period'].strftime(time_format) for entry in grouped_scores]
            line_scores = [round(entry['avg_score'], 2) for entry in grouped_scores]

            # Top threat users
            top_threat_users_qs = (
                ActivityLogs.objects
                .filter(is_suspicious=True, timestamp__date__range=(start_date, end_date))
                .values('user__username')
                .annotate(count=Count('id'))
                .order_by('-count')[:5]
            )
            top_threat_users = [
                {'username': entry['user__username'] or 'Unknown', 'count': entry['count']}
                for entry in top_threat_users_qs
            ]
            # Tooltip details for each point: dynamically based on group_by
            tooltip_qs = (
                Alerts.objects
                .filter(log__timestamp__date__range=(start_date, end_date))
                .annotate(period=truncate_fn('log__timestamp'))
                .values('period', 'log__user__username', 'log__activity_type')
                .annotate(avg_score=Avg('score'))
                .order_by('period')
            )

            tooltip_details = []
            for entry in tooltip_qs:
                tooltip_details.append({
                    'period': entry['period'].strftime(time_format),
                    'user': entry['log__user__username'] or 'Unknown',
                    'reason': entry['log__activity_type'] or 'No reason',
                })

            # Pie chart
            pie_data = (
                ActivityLogs.objects
                .filter(is_suspicious=True, timestamp__date__range=(start_date, end_date))
                .values('activity_type')
                .annotate(count=Count('id'))
                .order_by('-count')[:5]
            )
            pie_labels = [entry['activity_type'] for entry in pie_data]
            pie_counts = [entry['count'] for entry in pie_data]

            # Bar chart
            bar_qs = (
                Alerts.objects
                .filter(log__user__isnull=False, log__timestamp__date__range=(start_date, end_date))
                .values('log__user__username')
                .annotate(avg_score=Avg('score'), activity_count=Count('id'))
                .order_by('-avg_score')[:5]
            )
            bar_labels = [entry['log__user__username'] or 'Unknown' for entry in bar_qs]
            bar_scores = [round(entry['avg_score'], 2) for entry in bar_qs]
            bar_counts = [entry['activity_count'] for entry in bar_qs]

            return JsonResponse({
                'hourLabels': line_labels,  # label reused for all time ranges
                'hourScores': line_scores,
                'pieLabels': pie_labels,
                'pieData': pie_counts,
                'barLabels': bar_labels,
                'barScores': bar_scores,
                'tooltipDetails': tooltip_details,
                'barCounts': bar_counts,
                'topThreatUsers': top_threat_users,
                'startDateUsed': str(start_date),
                'endDateUsed': str(end_date),
                'groupBy': group_by
            })

        except Exception as e:
            return JsonResponse({'error': str(e)}, status=400)