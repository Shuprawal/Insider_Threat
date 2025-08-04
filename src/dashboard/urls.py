from django.urls import path
from .views import *

urlpatterns = [

    path('dashboard-data/', DashboardView.as_view(), name='dashboard_data'),
]
