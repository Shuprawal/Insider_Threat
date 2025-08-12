from django.apps import AppConfig


class ThreatDetectionConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'ThreatDetection'

    def ready(self):
        from . import signals




