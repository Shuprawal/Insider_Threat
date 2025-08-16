# src/dashboard/models.py
from django.db import models

class RealtimeSettings(models.Model):
    score_high_threshold = models.PositiveIntegerField(default=60)

    flash_color_a  = models.CharField(max_length=7, default="#ffffff")
    flash_color_b  = models.CharField(max_length=7, default="#b91c1c")
    flash_opacity  = models.FloatField(default=0.35)
    flash_speed_ms = models.PositiveIntegerField(default=700)
    flash_total_ms = models.PositiveIntegerField(default=12000)

    sound_enabled = models.BooleanField(default=True)

    # NEW: writable URLs (persist dropdown selections)
    sound_normal_url = models.CharField(max_length=512, blank=True, null=True)
    sound_high_url   = models.CharField(max_length=512, blank=True, null=True)

    # Optional uploaded files (also supported)
    sound_normal_file = models.FileField(upload_to="sounds/", null=True, blank=True)
    sound_normal_volume = models.FloatField(default=0.55)
    sound_normal_repeat_ms = models.PositiveIntegerField(default=0)
    sound_normal_max_ms = models.PositiveIntegerField(default=4000)

    sound_high_file = models.FileField(upload_to="sounds/", null=True, blank=True)
    sound_high_volume = models.FloatField(default=0.75)
    sound_high_repeat_ms = models.PositiveIntegerField(default=1500)
    sound_high_max_ms = models.PositiveIntegerField(default=10000)

    banner_title = models.CharField(max_length=200, default="⚠️ Real-Time Threat Alert")
    template_normal = models.TextField(default="{user} triggered anomaly with score {score_pct}% — {reason}")
    template_high = models.TextField(default="🚨 {user} triggered HIGH anomaly ({score_pct}%) — {reason}")
    date_format = models.CharField(max_length=32, default="YYYY-MM-DD HH:mm")
    max_lines = models.PositiveIntegerField(default=3)

    updated_at = models.DateTimeField(auto_now=True)

    def save(self, *a, **kw):
        self.pk = 1  # force singleton row
        super().save(*a, **kw)

    def __str__(self):
        return "Realtime Settings"
