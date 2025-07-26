from django.test import TestCase
from ThreatDetection.models import CustomUser
import json

class AuthViewsTest(TestCase):
    def test_user_registration_success(self):
        response = self.client.post('/api/custom-register/', json.dumps({
            'username': 'newuser',
            'password': 'password123',
            'department': 'IT',
            'role': 'employee'
        }), content_type="application/json")
        self.assertEqual(response.status_code, 200)
        self.assertIn("success", response.json())

    def test_duplicate_user_registration(self):
        CustomUser.objects.create(username="duplicate")
        response = self.client.post('/api/custom-register/', json.dumps({
            'username': 'duplicate',
            'password': 'password123',
        }), content_type="application/json")
        self.assertEqual(response.status_code, 400)

    def test_login_success(self):
        user, _ = CustomUser.objects.get_or_create(username="admin")
        user.set_password("admin123")
        user.save()

        response = self.client.post('/api/custom-login/', json.dumps({
            'username': 'admin',
            'password': 'admin123'
        }), content_type="application/json")
        self.assertEqual(response.status_code, 200)
        self.assertIn("token", response.json())

    def test_login_invalid_password(self):
        user, _ = CustomUser.objects.get_or_create(username="wrongpass")
        user.set_password("correctpass")
        user.save()

        response = self.client.post('/api/custom-login/', json.dumps({
            'username': 'wrongpass',
            'password': 'invalid'
        }), content_type="application/json")
        self.assertEqual(response.status_code, 401)
