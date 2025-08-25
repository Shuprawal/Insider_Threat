# # ThreatDetection/urls.py
#
# from django.urls import path
# from . import views
# from .views import *
#
# urlpatterns = [
#     path('custom-login/', views.custom_login),
#     path('logs/list/', views.custom_log_list),
#     path('users/', views.user_list),
#     path('alerts/', views.alerts_list),
#     path('hybrid-threats/', hybrid_user_level_threat_detection, name='hybrid_threats'),
#     path('logs/all/', get_all_logs, name='get_all_logs'),
# ]
# ThreatDetection/urls.py
from django.urls import path, re_path
from . import views

urlpatterns = [
    # Login
    re_path(r'^(?:custom_login|custom-login)/?$', views.custom_login, name='custom_login'),

    # Users list
    re_path(r'^(?:user_list|users)/?$', views.user_list, name='user_list'),

    # Logs
    re_path(r'^logs/create/?$', views.custom_log_create, name='custom_log_create'),
    re_path(r'^logs/list/?$', views.custom_log_list, name='custom_log_list'),
    re_path(r'^logs/admin/all/?$', views.CustomLogListAllView.as_view(), name='custom_log_list_all'),
    re_path(r'^logs/all/?$', views.get_all_logs, name='get_all_logs'),
    re_path(r'^logs/me/?$', views.fetch_activity_logs_for_user, name='fetch_activity_logs_for_user'),

    # Alerts
    re_path(r'^alerts/?$', views.alerts_list, name='alerts_list'),

    # (Keep any other endpoints you need)
    re_path(r'^hybrid-threats/?$', views.hybrid_user_level_threat_detection, name='hybrid_threats'),
]
