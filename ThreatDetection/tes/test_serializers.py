from django.test import TestCase
from ThreatDetection.models import CustomUser
from ThreatDetection.serializers import ActivityLogSerializer
from django.utils import timezone

class ActivityLogSerializerTest(TestCase):
    def setUp(self):
        self.user = CustomUser.objects.create(username="serialuser")
        self.user.set_password("123")
        self.user.save()

    def test_missing_required_fields(self):
        data = {
            'resource_accessed': '/admin',
        }
        serializer = ActivityLogSerializer(data=data)
        self.assertFalse(serializer.is_valid())

    def test_valid_log_serializer(self):
        data = {
            'activity_type': 'Login',
            'resource_accessed': '/admin',
            'action_result': 'Success',
            'timestamp': timezone.now(),
            'is_suspicious': False,
            'details': 'Normal access'
        }
        serializer = ActivityLogSerializer(data=data)
        self.assertTrue(serializer.is_valid())


