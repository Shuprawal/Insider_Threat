# dashboard/serializers.py
from rest_framework import serializers
from .models import RealtimeSettings

class RealtimeSettingsSerializer(serializers.ModelSerializer):
    # Read-only derived URLs for uploaded files
    sound_normal_file_url = serializers.SerializerMethodField()
    sound_high_file_url   = serializers.SerializerMethodField()

    class Meta:
        model = RealtimeSettings
        fields = [
            "score_high_threshold",
            "flash_color_a", "flash_color_b", "flash_opacity", "flash_speed_ms", "flash_total_ms",
            "sound_enabled",

            # NEW: writable URL fields
            "sound_normal_url", "sound_high_url",

            # Uploaded files + derived URLs
            "sound_normal_file", "sound_normal_file_url",
            "sound_normal_volume", "sound_normal_repeat_ms", "sound_normal_max_ms",

            "sound_high_file", "sound_high_file_url",
            "sound_high_volume", "sound_high_repeat_ms", "sound_high_max_ms",

            "banner_title", "template_normal", "template_high", "date_format", "max_lines",
            "updated_at",
        ]

    def get_sound_normal_file_url(self, obj):
        req = self.context.get("request")
        f = obj.sound_normal_file
        return req.build_absolute_uri(f.url) if (f and req) else (f.url if f else None)

    def get_sound_high_file_url(self, obj):
        req = self.context.get("request")
        f = obj.sound_high_file
        return req.build_absolute_uri(f.url) if (f and req) else (f.url if f else None)
