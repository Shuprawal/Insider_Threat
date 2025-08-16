#
# from rest_framework import serializers
# from .models import Log
#
# class LogSerializer(serializers.ModelSerializer):
#     class Meta:
#         model = Log
#         fields = ['id', 'user', 'action', 'created_at']

from rest_framework import serializers
from .models import ActivityLogs, CustomUser, Alerts

class CustomUserSerializer(serializers.ModelSerializer):
    class Meta:
        model = CustomUser
        fields = [
            'id', 'username', 'email', 'first_name', 'last_name',
            'department', 'role', 'is_superuser',  'is_active',
            'is_suspended', 'profile_picture'
        ]

class ActivityLogSerializer(serializers.ModelSerializer):
    user = CustomUserSerializer(read_only=True)

    class Meta:
        model = ActivityLogs
        fields = '__all__'
        read_only_fields = ['user']

class AlertsSerializer(serializers.ModelSerializer):
    class Meta:
        model = Alerts
        fields = '__all__'