# tests/test_integration_misc_views.py
import pytest
from django.utils import timezone

@pytest.mark.django_db
def test_get_all_logs_public_list(api_client, make_logs):
    make_logs(6)
    res = api_client.get("/api/logs/all")
    assert res.status_code == 200, "get_all_logs should return 200"
    data = res.json()
    assert "logs" in data and isinstance(data["logs"], list)
    assert len(data["logs"]) <= 50, "Endpoint caps to last 50 logs"
    print(f"Test Passed: get_all_logs returned {len(data['logs'])} logs (<= 50)")

@pytest.mark.django_db
def test_fetch_activity_logs_for_user_requires_auth(api_client):
    res = api_client.get("/api/logs/me")
    assert res.status_code == 401, ("fetch_activity_logs_for_user "
                                    "should require auth")
    print("Test Passed: fetch_activity_logs_for_user"
          " rejected unauthenticated request with 401")

@pytest.mark.django_db
def test_fetch_activity_logs_for_user_ok(api_client, auth_header, make_logs):
    make_logs(3)
    res = api_client.get("/api/logs/me", **auth_header)
    assert res.status_code == 200
    data = res.json()
    assert "logs" in data and isinstance(data["logs"], list)
    print(f"Test Passed: fetch_activity_logs_for_user returned"
          f" {len(data['logs'])} items for current user")
