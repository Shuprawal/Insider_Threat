

from django.db.models import Count, Avg
from django.http import JsonResponse
from django.shortcuts import redirect
from django.utils.timezone import now, timedelta
from django.utils.timezone import now
from django.views import View

from ThreatDetection.models import Alerts, ActivityLogs
from .forms import *



# views.py
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

# views.py
from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo
from django.http import JsonResponse
from django.views import View
from django.utils import timezone
from django.db.models import Count, Avg
from django.db.models.functions import TruncHour, TruncDay, TruncWeek, TruncMonth

from ThreatDetection.models import ActivityLogs, Alerts
from .forms import DateRangeForm

LOCAL_TZ = ZoneInfo("Asia/Kathmandu")  # display/bucketing zone

def _local_day_bounds_to_utc(d):
    """Given a Python date, return (start_utc, end_utc) covering that local day."""
    start_local = datetime.combine(d, time(0, 0, 0), tzinfo=LOCAL_TZ)
    end_local   = datetime.combine(d, time(23, 59, 59, 999000), tzinfo=LOCAL_TZ)
    return start_local.astimezone(timezone.utc), end_local.astimezone(timezone.utc)

class DashboardView(View):
    def get(self, request):

        # user = getattr(request, "user", None)
        # if not getattr(user, "is_authenticated", False):
        #     return JsonResponse({"detail": "Authentication credentials were not provided."}, status=401)
        #
        # role = (getattr(user, "role", "") or "").lower()
        # is_admin_like = (role == "admin") or bool(getattr(user, "is_superuser", False))
        #
        # if not is_admin_like:
        #     # If it looks like a page navigation, do a real HTTP redirect
        #     accepts = request.META.get("HTTP_ACCEPT", "")
        #     if "text/html" in accepts:
        #         return redirect("/employee/dashboard")
        #
        #     # If it's an API call (fetch/axios), return a 403 with a redirect hint
        #     return JsonResponse(
        #         {
        #             "detail": "Employees should use the Employee Dashboard.",
        #             "redirect_to": "/employee/dashboard",
        #         },
        #         status=403,
        #     )


        try:
            form = DateRangeForm(request.GET)
            if not form.is_valid():
                # helpful in dev; remove if you prefer
                return JsonResponse({'error': form.errors}, status=400)

            start_d = form.cleaned_data.get('start_date')  # Python date or None
            end_d   = form.cleaned_data.get('end_date')    # Python date or None

            # Defaults
            if not start_d and not end_d:
                end_d = timezone.now().date()
                start_d = end_d  # show one day by default
            elif start_d and not end_d:
                end_d = start_d
            elif end_d and not start_d:
                start_d = end_d

            # Build UTC window from local calendar days
            start_utc, _ = _local_day_bounds_to_utc(start_d)
            _, end_utc   = _local_day_bounds_to_utc(end_d)

            # groupBy hint
            span_days = (end_utc - start_utc).total_seconds() / 86400.0
            if span_days <= 1:
                group_by, trunc_fn = 'hour', TruncHour
            elif span_days <= 7:
                group_by, trunc_fn = 'day', TruncDay
            elif span_days <= 90:
                group_by, trunc_fn = 'week', TruncWeek
            else:
                group_by, trunc_fn = 'month', TruncMonth

            # ----- LINE: individual alert points -----
            alerts_qs = (
                Alerts.objects
                .filter(log__timestamp__gte=start_utc, log__timestamp__lte=end_utc)
                .select_related('log__user')
                .order_by('log__timestamp')
            )

            alert_points = []
            for a in alerts_qs:
                log = a.log
                ts = getattr(log, "timestamp", None)
                if ts is None:
                    continue
                if timezone.is_naive(ts):
                    ts = timezone.make_aware(ts, timezone.utc)
                ts_iso = ts.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")

                score = float(a.score or 0.0)
                if score <= 1:
                    score *= 100.0

                alert_points.append({
                    "timestamp": ts_iso,
                    "score": round(score, 2),
                    "user": getattr(getattr(log, "user", None), "username", "Unknown"),
                    "reason": getattr(log, "activity_type", None) or (a.reason or "No reason"),
                })

            # ----- TOP USERS -----
            top_qs = (
                ActivityLogs.objects
                .filter(is_suspicious=True, timestamp__gte=start_utc, timestamp__lte=end_utc)
                .values('user__username')
                .annotate(count=Count('id'))
                .order_by('-count')[:5]
            )
            top_threat_users = [
                {"username": e["user__username"] or "Unknown", "count": e["count"]}
                for e in top_qs
            ]

            # ----- PIE -----
            pie_qs = (
                ActivityLogs.objects
                .filter(is_suspicious=True, timestamp__gte=start_utc, timestamp__lte=end_utc)
                .values('activity_type')
                .annotate(count=Count('id'))
                .order_by('-count')[:5]
            )
            pie_labels = [e['activity_type'] for e in pie_qs]
            pie_counts = [e['count'] for e in pie_qs]

            # ----- BAR -----
            bar_qs = (
                Alerts.objects
                .filter(log__user__isnull=False, log__timestamp__gte=start_utc, log__timestamp__lte=end_utc)
                .values('log__user__username')
                .annotate(avg_score=Avg('score'), activity_count=Count('id'))
                .order_by('-avg_score')[:5]
            )
            bar_labels = [e['log__user__username'] or 'Unknown' for e in bar_qs]
            bar_scores = [
                round((e['avg_score'] * 100.0) if (e['avg_score'] or 0) <= 1 else e['avg_score'], 2)
                for e in bar_qs
            ]
            bar_counts = [e['activity_count'] for e in bar_qs]

            print("🕒 start_utc:", start_utc, " end_utc:", end_utc)
            print("🔎 count in window:",
                  Alerts.objects.filter(log__timestamp__gte=start_utc,
                                        log__timestamp__lte=end_utc).count())

            last = Alerts.objects.select_related("log").order_by("-id").first()
            print("🧪 last alert:", getattr(last, "id", None),
                  " log.ts=", getattr(getattr(last, "log", None), "timestamp", None))

            return JsonResponse({
                "alertPoints": alert_points,
                "pieLabels": pie_labels,
                "pieData": pie_counts,
                "barLabels": bar_labels,
                "barScores": bar_scores,
                "barCounts": bar_counts,
                "topThreatUsers": top_threat_users,
                "startUtc": start_utc.isoformat().replace("+00:00", "Z"),
                "endUtc": end_utc.isoformat().replace("+00:00", "Z"),
                "groupBy": group_by,
            })
        except Exception as e:
            return JsonResponse({"error": str(e)}, status=400)



#
# class DashboardView(View):
#
#     def get(self, request):
#         try:
#             form = DateRangeForm(request.GET)
#             if not form.is_valid():
#                 print('Form errors:', form.errors)
#                 return JsonResponse({'error': form.errors}, status=400)
#
#             # ✅ Extract cleaned values
#             start_date = form.cleaned_data.get('start_date')
#             end_date = form.cleaned_data.get('end_date')
#
#             # ✅ Default to last 24 hours if both are missing
#             if not start_date and not end_date:
#                 end_date = now().date()
#                 start_date = end_date - timedelta(days=1)
#             elif start_date and not end_date:
#                 end_date = now().date()
#             elif end_date and not start_date:
#                 start_date = end_date - timedelta(days=1)
#
#             # Determine grouping label only (still sent)
#             date_range_days = (end_date - start_date).days
#             if date_range_days <= 1:
#                 group_by = 'hour'
#             elif date_range_days <= 7:
#                 group_by = 'day'
#             elif date_range_days <= 90:
#                 group_by = 'week'
#             else:
#                 group_by = 'month'
#
#             # ✅ NEW: Line chart — every threat alert as individual point
#             alerts_qs = (
#                 Alerts.objects
#                 .filter(log__timestamp__date__range=(start_date, end_date))
#                 .select_related('log__user')
#                 .order_by('log__timestamp')
#             )
#
#             alert_points = []
#             for alert in alerts_qs:
#                 log = alert.log
#                 timestamp_str = log.timestamp.strftime('%Y-%m-%d %H:%M')
#                 alert_points.append({
#                     'timestamp': timestamp_str,
#                     'score': round(alert.score, 2),
#                     'user': log.user.username if log.user else 'Unknown',
#                     'reason': log.activity_type or 'No reason'
#                 })
#
#             # ✅ Top threat users
#             top_threat_users_qs = (
#                 ActivityLogs.objects
#                 .filter(is_suspicious=True, timestamp__date__range=(start_date, end_date))
#                 .values('user__username')
#                 .annotate(count=Count('id'))
#                 .order_by('-count')[:5]
#             )
#             top_threat_users = [
#                 {'username': entry['user__username'] or 'Unknown', 'count': entry['count']}
#                 for entry in top_threat_users_qs
#             ]
#
#             # ✅ Pie chart
#             pie_data = (
#                 ActivityLogs.objects
#                 .filter(is_suspicious=True, timestamp__date__range=(start_date, end_date))
#                 .values('activity_type')
#                 .annotate(count=Count('id'))
#                 .order_by('-count')[:5]
#             )
#             pie_labels = [entry['activity_type'] for entry in pie_data]
#             pie_counts = [entry['count'] for entry in pie_data]
#
#             # ✅ Bar chart
#             bar_qs = (
#                 Alerts.objects
#                 .filter(log__user__isnull=False, log__timestamp__date__range=(start_date, end_date))
#                 .values('log__user__username')
#                 .annotate(avg_score=Avg('score'), activity_count=Count('id'))
#                 .order_by('-avg_score')[:5]
#             )
#             bar_labels = [entry['log__user__username'] or 'Unknown' for entry in bar_qs]
#             bar_scores = [round(entry['avg_score'], 2) for entry in bar_qs]
#             bar_counts = [entry['activity_count'] for entry in bar_qs]
#
#             return JsonResponse({
#                 'alertPoints': alert_points,
#                 'pieLabels': pie_labels,
#                 'pieData': pie_counts,
#                 'barLabels': bar_labels,
#                 'barScores': bar_scores,
#                 'barCounts': bar_counts,
#                 'topThreatUsers': top_threat_users,
#                 'startDateUsed': str(start_date),
#                 'endDateUsed': str(end_date),
#                 'groupBy': group_by
#             })
#
#         except Exception as e:
#             return JsonResponse({'error': str(e)}, status=400)
#







from django.db import transaction
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import BasePermission, SAFE_METHODS
from rest_framework import status

from .models import RealtimeSettings
from .serializers import RealtimeSettingsSerializer




class RealtimeSettingsView(APIView):


    def _singleton(self):
        # Your model already forces pk=1 on save; this guarantees it exists.
        obj, _ = RealtimeSettings.objects.get_or_create(pk=1)
        return obj

    def get(self, request):
        obj = self._singleton()
        ser = RealtimeSettingsSerializer(obj, context={"request": request})
        return Response(ser.data)

    @transaction.atomic
    def put(self, request):
        obj = self._singleton()
        ser = RealtimeSettingsSerializer(
            obj, data=request.data, partial=True, context={"request": request}
        )
        if ser.is_valid():
            ser.save()
            return Response(ser.data)
        return Response(ser.errors, status=status.HTTP_400_BAD_REQUEST)
