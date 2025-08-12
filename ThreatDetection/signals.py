# ThreatDetection/signals.py
from django.db.models.signals import post_migrate
from django.dispatch import receiver
from django.core import management
from ThreatDetection.models import ActivityLogs


@receiver(post_migrate)
def auto_bootstrap(sender, **kwargs):

    if not ActivityLogs.objects.exists():
        try:
            management.call_command("bootstrap_demo")
        except Exception as e:

            print("[bootstrap_demo] skipped:", e)
