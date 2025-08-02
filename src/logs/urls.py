from django.urls import path
from .views import *

urlpatterns = [
    path('analyze-logs/', AnalyzeLogs.as_view(), name='analyze-logs'),

    path('logs/create/', SingleLogAnalyzer.as_view(), name='create-log'),
]
