# # tes/conftest.py
# import pytest
#
# @pytest.fixture
# def user(db):
#     from ThreatDetection.models import CustomUser  # import inside the fixture
#     return CustomUser.objects.create_user(
#         username="alice",
#         password="secret",
#         email="a@x.com",
#         department="IT",
#         role="employee",
#         is_active=True,
#     )
#
# @pytest.fixture
# def admin(db):
#     from ThreatDetection.models import CustomUser
#     return CustomUser.objects.create_user(
#         username="admin",
#         password="adminpw",
#         email="admin@x.com",
#         department="Sec",
#         role="admin",
#         is_active=True,
#     )


# tests/conftest.py
import json
import pytest
import datetime as dt

from django.utils import timezone
from rest_framework.test import APIClient
from django.test import RequestFactory

@pytest.fixture
def rf():
    return RequestFactory()

@pytest.fixture
def api_client():
    return APIClient()

@pytest.fixture
def user(db):
    from ThreatDetection.models import CustomUser
    return CustomUser.objects.create_user(
        username="alice",
        password="secret",
        email="a@x.com",
        department="IT",
        role="employee",
        is_active=True,
    )

@pytest.fixture
def admin(db):
    from ThreatDetection.models import CustomUser
    return CustomUser.objects.create_user(
        username="admin",
        password="adminpw",
        email="admin@x.com",
        department="Sec",
        role="admin",
        is_active=True,
    )

@pytest.fixture
def auth_header(user):
    """Bearer header for normal user."""
    from ThreatDetection.auth_utils import generate_auth_token
    token = generate_auth_token(user)
    return {"HTTP_AUTHORIZATION": f"Bearer {token}"}

@pytest.fixture
def admin_auth_header(admin):
    """Bearer header for admin."""
    from ThreatDetection.auth_utils import generate_auth_token
    token = generate_auth_token(admin)
    return {"HTTP_AUTHORIZATION": f"Bearer {token}"}

@pytest.fixture
def sample_log(db, user):
    from ThreatDetection.models import ActivityLogs
    ts = timezone.now() - dt.timedelta(minutes=5)
    return ActivityLogs.objects.create(
        user=user,
        activity_type="file_access",
        resource_accessed="/srv/docs/plan.pdf",
        action_result="opened",
        timestamp=ts,
        is_suspicious=False,
        details="normal access"
    )

@pytest.fixture
def make_logs(db, user):
    from ThreatDetection.models import ActivityLogs
    def _mk(n=3):
        objs = []
        now = timezone.now()
        for i in range(n):
            objs.append(ActivityLogs.objects.create(
                user=user,
                activity_type="login" if i % 2 == 0 else "email",
                resource_accessed="",
                action_result="success",
                timestamp=now - dt.timedelta(minutes=i),
                is_suspicious=(i == 0),
                details=f"event {i}",
            ))
        return objs
    return _mk
