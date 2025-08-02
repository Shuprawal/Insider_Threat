from django.shortcuts import render
from django.views import View


# Create your views here.




class DashboardView(View):
    def get_threat_chart_data(request):
        today = now().date()
        current_time = now().replace(minute=0, second=0, microsecond=0)
        start_time = current_time.replace(hour=0)

        # Line Chart — Hourly Threat Confidence Score
        hourly_scores = (
            Alerts.objects
            .filter(log__timestamp__date=today)
            .annotate(hour=Count('log__timestamp__hour'))
            .values('log__timestamp__hour')
            .annotate(avg_score=Avg('score'))
            .order_by('log__timestamp__hour')
        )

        all_hours = [f"{h:02}:00" for h in range(24)]
        hour_score_map = {
            f"{entry['log__timestamp__hour']:02}:00": round(entry['avg_score'], 2)
            for entry in hourly_scores
        }
        hour_scores = [hour_score_map.get(hour, 0) for hour in all_hours]

        # Pie Chart — Top Suspicious Activities
        pie_data = (
            ActivityLogs.objects
            .filter(is_suspicious=True, timestamp__date=today)
            .values('activity_type')
            .annotate(count=Count('id'))
            .order_by('-count')[:5]
        )
        pie_labels = [entry['activity_type'] for entry in pie_data]
        pie_counts = [entry['count'] for entry in pie_data]

        # Bar Chart — Top Suspicious Users
        suspicious_users = (
            ActivityLogs.objects
            .filter(is_suspicious=True, timestamp__date=today)
            .values('user__username')
            .annotate(count=Count('id'))
            .order_by('-count')[:5]
        )
        bar_labels = [entry['user__username'] or 'Unknown' for entry in suspicious_users]
        bar_counts = [entry['count'] for entry in suspicious_users]

        return JsonResponse({
            'hourLabels': all_hours,
            'hourScores': hour_scores,
            'pieLabels': pie_labels,
            'pieData': pie_counts,
            'barLabels': bar_labels,
            'barCounts': bar_counts,
        })

