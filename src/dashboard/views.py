

from django.db.models import Count, Avg
from django.db.models.functions import TruncHour, TruncDay, TruncWeek, TruncMonth
from django.http import JsonResponse
from django.utils.decorators import method_decorator
from django.utils.timezone import now, timedelta
from django.shortcuts import render
from django.utils.timezone import now
from django.views import View
import datetime

from django.views.decorators.csrf import ensure_csrf_cookie

from ThreatDetection.models import Alerts, ActivityLogs
from .forms import *

# Create your views here.



class DashboardView(View):

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

            # Determine grouping label only (still sent)
            date_range_days = (end_date - start_date).days
            if date_range_days <= 1:
                group_by = 'hour'
            elif date_range_days <= 7:
                group_by = 'day'
            elif date_range_days <= 90:
                group_by = 'week'
            else:
                group_by = 'month'

            # ✅ NEW: Line chart — every threat alert as individual point
            alerts_qs = (
                Alerts.objects
                .filter(log__timestamp__date__range=(start_date, end_date))
                .select_related('log__user')
                .order_by('log__timestamp')
            )

            alert_points = []
            for alert in alerts_qs:
                log = alert.log
                timestamp_str = log.timestamp.strftime('%Y-%m-%d %H:%M')
                alert_points.append({
                    'timestamp': timestamp_str,
                    'score': round(alert.score, 2),
                    'user': log.user.username if log.user else 'Unknown',
                    'reason': log.activity_type or 'No reason'
                })

            # ✅ Top threat users
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

            # ✅ Pie chart
            pie_data = (
                ActivityLogs.objects
                .filter(is_suspicious=True, timestamp__date__range=(start_date, end_date))
                .values('activity_type')
                .annotate(count=Count('id'))
                .order_by('-count')[:5]
            )
            pie_labels = [entry['activity_type'] for entry in pie_data]
            pie_counts = [entry['count'] for entry in pie_data]

            # ✅ Bar chart
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
                'alertPoints': alert_points,
                'pieLabels': pie_labels,
                'pieData': pie_counts,
                'barLabels': bar_labels,
                'barScores': bar_scores,
                'barCounts': bar_counts,
                'topThreatUsers': top_threat_users,
                'startDateUsed': str(start_date),
                'endDateUsed': str(end_date),
                'groupBy': group_by
            })

        except Exception as e:
            return JsonResponse({'error': str(e)}, status=400)





#
#
# from rest_framework.generics import RetrieveUpdateAPIView
# from rest_framework.permissions import IsAuthenticated, IsAdminUser, AllowAny
# from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
# from rest_framework_simplejwt.authentication import JWTAuthentication
# from .models import RealtimeSettings
# from .serializers import RealtimeSettingsSerializer
#
# class RealtimeSettingsSingleton(RetrieveUpdateAPIView):
#     authentication_classes = (JWTAuthentication,)
#     parser_classes = (MultiPartParser, FormParser, JSONParser)
#     serializer_class = RealtimeSettingsSerializer
#
#     def get_object(self):
#         obj, _ = RealtimeSettings.objects.get_or_create(pk=1)
#         return obj
#
#     def get_permissions(self):
#         # Auth required for all; admin required to modify
#         if self.request.method in ("PUT", "PATCH"):
#             return [IsAuthenticated(), IsAdminUser()]
#         return [IsAuthenticated()]



# dashboard/views_realtime.py
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
