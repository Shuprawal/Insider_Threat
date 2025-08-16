from django.urls import path

from . import views
from .views import *

urlpatterns = [
    path('analyze-logs/', AnalyzeLogs.as_view(), name='analyze-logs'),

    path('logs/create/', SingleLogAnalyzer.as_view(), name='create-log'),

    path("activities/analyze/", AnalyzeUserActivity.as_view(), name="analyze-user-activity"),

    path("userslist/", EligibleUsersListView.as_view(), name="eligible-users"),




]
