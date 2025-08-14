

# Register your models here.

from django.contrib import admin
from .models import RealtimeSettings

@admin.register(RealtimeSettings)
class RealtimeSettingsAdmin(admin.ModelAdmin):
    fieldsets = (
        ("Threshold", {"fields": ("score_high_threshold",)}),
        ("Flash", {"fields": ("flash_color_a","flash_color_b","flash_opacity","flash_speed_ms","flash_total_ms")}),
        ("Sound - Normal", {"fields": ("sound_enabled","sound_normal_file","sound_normal_volume","sound_normal_repeat_ms","sound_normal_max_ms")}),
        ("Sound - High", {"fields": ("sound_high_file","sound_high_volume","sound_high_repeat_ms","sound_high_max_ms")}),
        ("Text / Templates", {"fields": ("banner_title","template_normal","template_high","date_format","max_lines")}),
    )
    def has_add_permission(self, request):  # keep singleton
        return not RealtimeSettings.objects.exists()
