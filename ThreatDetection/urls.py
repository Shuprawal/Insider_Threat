# ThreatDetection/urls.py

from django.urls import path
from . import views
from .views import *

urlpatterns = [
    path('custom-login/', views.custom_login),
    path('logs/list/', views.custom_log_list),
    path('users/', views.user_list),
    path('alerts/', views.alerts_list),
    path('hybrid-threats/', hybrid_user_level_threat_detection, name='hybrid_threats'),
    path('logs/all/', get_all_logs, name='get_all_logs'),
]
