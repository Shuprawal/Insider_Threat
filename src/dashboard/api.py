# src/dashboard/api.py
from rest_framework import serializers, viewsets, permissions
from rest_framework.parsers import MultiPartParser, FormParser
from .models import RealtimeSettings

class RealtimeSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = RealtimeSettings
        fields = "__all__"

class RealtimeSettingsViewSet(viewsets.ModelViewSet):
    serializer_class = RealtimeSettingsSerializer
    permission_classes = [permissions.IsAdminUser]
    parser_classes = [MultiPartParser, FormParser]
    http_method_names = ["get", "put", "patch"]

    def get_object(self):
        obj, _ = RealtimeSettings.objects.get_or_create(pk=1)
        return obj

    def get_queryset(self):
        return RealtimeSettings.objects.filter(pk=1)
