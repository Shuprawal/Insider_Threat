from django.urls import path

from . import views
from .views import *

urlpatterns = [
    path('analyze-logs/', AnalyzeLogs.as_view(), name='analyze-logs'),

    path('logs/create/', SingleLogAnalyzer.as_view(), name='create-log'),
    path("activities/analyze/", AnalyzeUserActivity.as_view(), name="analyze-user-activity"),

    path("sessions/start/", StartUserSession.as_view()),
    path("sessions/log/", LogUserActivity.as_view()),
    path("sessions/end/", EndUserSession.as_view()),


]
