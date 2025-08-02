# ThreatDetection/urls.py

from django.urls import path
from . import views
from .views import *

urlpatterns = [
    path('custom-login/', views.custom_login),
    path('custom-register/', views.custom_register),
    path('logs/create/', views.custom_log_create),
    path('logs/list/', views.custom_log_list),
    path('users/', views.user_list),
    # path('logs/all/', views.get_threat_chart_data.as_view(), name='all-logs'),
    # path('logs/all/', views.AllLogsView.as_view(), name='all-logs'),
    path('analyze-logs/', views.analyze_uploaded_logs, name='analyze-logs'),
    path('alerts/', views.alerts_list),


    # path('api/custom-login/', views.custom_login),
    path('custom-login/', views.custom_login),
    path('hybrid-threats/', hybrid_user_level_threat_detection, name='hybrid_threats'),

    path('logs/all/', get_all_logs, name='get_all_logs'),
    path('dashboard-data/', get_threat_chart_data, name='dashboard_data'),


]





