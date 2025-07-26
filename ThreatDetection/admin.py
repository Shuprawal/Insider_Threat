from django.contrib import admin

from django.contrib import admin
from .models import CustomUser, ActivityLogs, Alerts, ThreatRules, AuditLogs

admin.site.register(CustomUser)
admin.site.register(ActivityLogs)
admin.site.register(Alerts)
admin.site.register(ThreatRules)
admin.site.register(AuditLogs)