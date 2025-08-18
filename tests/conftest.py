# tes/conftest.py
import pytest

@pytest.fixture
def user(db):
    from ThreatDetection.models import CustomUser  # import inside the fixture
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
