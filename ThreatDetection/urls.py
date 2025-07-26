# ThreatDetection/urls.py

from django.urls import path
from . import views
from .views import hybrid_user_level_threat_detection, CustomLogListAllView

urlpatterns = [
    path('custom-login/', views.custom_login),
    path('custom-register/', views.custom_register),
    path('logs/create/', views.custom_log_create),
    path('logs/list/', views.custom_log_list),
    path('users/', views.user_list),

# urls.py
#     path('logs/all/', views.custom_log_list_all),
#     path('api/logs/all/', CustomLogListAllView.as_view(), name='custom_log_list_all'),
    path('logs/all/', views.AllLogsView.as_view(), name='all-logs'),
    path('analyze-logs/', views.analyze_uploaded_logs, name='analyze_uploaded_logs'),
    path('alerts/', views.alerts_list),


    # path('api/custom-login/', views.custom_login),
    path('custom-login/', views.custom_login),
    path('hybrid-threats/', hybrid_user_level_threat_detection, name='hybrid_threats'),

]





