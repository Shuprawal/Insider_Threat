# tests/test_integration_logs_flow.py
import json
import pytest
from django.utils import timezone

@pytest.mark.django_db
def test_custom_log_create_as_self(api_client, user, auth_header):
    payload = {
        "activity_type": "login",
        "resource_accessed": "",
        "action_result": "success",
        "timestamp": timezone.now().isoformat(),
        "is_suspicious": False,
        "details": "self log"
    }
    res = api_client.post("/api/logs/create",
                          data=json.dumps(payload), content_type="application/json", **auth_header)
    assert res.status_code == 201,\
        f"Expected 201 Created. Got {res.status_code} body={res.content}"
    data = res.json()
    assert data["activity_type"] == "login", "Created log should echo fields"
    print("Test Passed: custom_log_create created a log for the authenticated user")

@pytest.mark.django_db
def test_custom_log_create_admin_for_other_user(api_client, admin, user, admin_auth_header):
    payload = {
        "user": user.id,  # admin creating for someone else
        "activity_type": "email",
        "resource_accessed": "outlook",
        "action_result": "sent",
        "timestamp": timezone.now().isoformat(),
        "is_suspicious": True,
        "details": "bulk email at midnight"
    }
    res = api_client.post("/api/logs/create",
                          data=json.dumps(payload), content_type="application/json", **admin_auth_header)
    assert res.status_code == 201, \
        f"Admin should be able to create logs for others. Got {res.status_code}"
    body = res.json()
    assert body["activity_type"] == "email"
    print("Test Passed: Admin created ActivityLog for another user")

@pytest.mark.django_db
def test_custom_log_list_self(api_client, user, auth_header, make_logs):
    make_logs(4)
    res = api_client.get("/api/logs/list", **auth_header)
    assert res.status_code == 200, f"Expected 200. Got {res.status_code}"
    data = res.json()
    assert isinstance(data, list), "custom_log_list returns a JSON array"
    assert len(data) >= 1, "Should return at least one log"
    print(f"Test Passed: custom_log_list returned {len(data)} items for the user")
