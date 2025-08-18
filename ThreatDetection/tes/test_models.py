from django.test import TestCase
from ThreatDetection.models import CustomUser, ActivityLogs
from django.utils import timezone

class CustomUserModelTest(TestCase):
    def setUp(self):
        self.user = CustomUser.objects.create(username="tester")
        self.user.set_password("secure123")
        self.user.save()

    def test_user_str_representation(self):
            self.assertEqual(str(self.user), "tester")

    def test_user_check_password_true(self):
        self.assertTrue(self.user.check_password("secure123"))

    def test_user_password_hashing(self):
        self.assertNotEqual(self.user.password_hash, "secure123")



    def test_user_check_password_false(self):
        self.assertFalse(self.user.check_password("wrongpass"))




class ActivityLogsModelTest(TestCase):
    def setUp(self):
        self.user = CustomUser.objects.create(username="loguser")
        self.user.set_password("pass123")
        self.user.save()
        self.log = ActivityLogs.objects.create(
            user=self.user,
            activity_type="Login",
            resource_accessed="/dashboard",
            action_result="Success",
            timestamp=timezone.now(),
            is_suspicious=True,
            details="Login at odd hour"
        )

    def test_log_fields_saved(self):
        self.assertEqual(self.log.activity_type, "Login")

    def test_log_str_representation(self):
        self.assertIn("Login", str(self.log))

