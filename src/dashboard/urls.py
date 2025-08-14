from django.urls import path
from .views import *

urlpatterns = [

    path('dashboard-data/', DashboardView.as_view(), name='dashboard_data'),
    # path("realtime-settings/", RealtimeSettingsSingleton.as_view(), name="realtime-settings"),
    # path("realtime-settings/", RealtimeSettingsSingleton.as_view(), name="realtime-settings"),
    path("realtime-settings/", RealtimeSettingsView.as_view(), name="realtime-settings"),
]
