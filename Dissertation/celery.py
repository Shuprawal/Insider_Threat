import os

from celery import Celery

# from Dissertation.celery import Celery

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'Dissertation.settings')

app = Celery('Dissertation')
app.config_from_object('django.conf:settings', namespace='CELERY')
app.autodiscover_tasks()
