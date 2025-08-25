# tests/test_regression_suite.py
import json
import pytest
from django.utils import timezone
from ThreatDetection.models import Alerts



@pytest.mark.regression
@pytest.mark.django_db
def test_reg_login_success_employee(api_client, user):
    payload = {"identifier": user.username, "password": "secret"}
    res = api_client.post("/api/custom_login",
                          data=json.dumps(payload), content_type="application/json")
    assert res.status_code == 200
    body = res.json()
    assert set(["token", "user", "redirect_to"]) <= set(body.keys())
    assert body["user"]["username"] == user.username
    assert body["redirect_to"] == "/employee/dashboard"
    print("Test Passed:"
          " /custom_login 200 with token + user + redirect_to=/employee/dashboard")


@pytest.mark.regression
@pytest.mark.django_db
def test_reg_login_invalid_password(api_client, user):
    payload = {"identifier": user.username, "password": "nope"}
    res = api_client.post("/api/custom_login",
                          data=json.dumps(payload), content_type="application/json")
    assert res.status_code == 401
    assert res.json().get("error") == "Invalid credentials"
    print("Test Passed: /custom_login 401 with error=Invalid credentials")

@pytest.mark.regression
@pytest.mark.django_db
def test_reg_login_suspended_user(api_client, user):
    user.is_suspended = True
    user.save()
    payload = {"identifier": user.username, "password": "secret"}
    res = api_client.post("/api/custom_login",
                          data=json.dumps(payload), content_type="application/json")
    assert res.status_code == 403
    assert "suspended" in res.json().get("error", "").lower()
    print("Test Passed: /custom_login 403 for suspended user")

# ---------- LOGS CONTRACTS ----------

@pytest.mark.regression
@pytest.mark.django_db
def test_reg_create_log_as_self(api_client, auth_header):
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
    assert res.status_code == 201
    body = res.json()
    assert body["activity_type"] == "login"
    assert isinstance(body.get("user"), dict)
    print("Test Passed: /logs/create 201 and nested user present")

@pytest.mark.regression
@pytest.mark.django_db
def test_reg_create_log_admin_for_user(api_client, admin_auth_header, user):
    payload = {
        "user": user.id,
        "activity_type": "email",
        "resource_accessed": "outlook",
        "action_result": "sent",
        "timestamp": timezone.now().isoformat(),
        "is_suspicious": True,
        "details": "bulk email"
    }
    res = api_client.post("/api/logs/create",
                          data=json.dumps(payload), content_type="application/json", **admin_auth_header)
    assert res.status_code == 201
    body = res.json()
    assert body["activity_type"] == "email"
    print("Test Passed: /logs/create 201 for admin creating on behalf of user")

@pytest.mark.regression
@pytest.mark.django_db
def test_reg_list_my_logs(api_client, auth_header, make_logs):
    make_logs(3)
    res = api_client.get("/api/logs/list", **auth_header)
    assert res.status_code == 200
    assert isinstance(res.json(), list)
    print(f"Test Passed: /logs/list 200 with {len(res.json())} items")

@pytest.mark.regression
@pytest.mark.django_db
def test_reg_public_latest_logs(api_client, make_logs):
    make_logs(6)
    res = api_client.get("/api/logs/all")
    assert res.status_code == 200
    body = res.json()
    assert "logs" in body and isinstance(body["logs"], list)
    assert len(body["logs"]) <= 50
    print(f"Test Passed: /logs/all 200 "
          f"logs_count={len(body['logs'])} (<=50)")

@pytest.mark.regression
@pytest.mark.django_db
def test_reg_my_logs_requires_auth(api_client):
    res = api_client.get("/api/logs/me")
    assert res.status_code == 401
    assert res.json().get("error") == "Unauthorized"
    print("Test Passed: /logs/me 401 without Authorization header")

@pytest.mark.regression
@pytest.mark.django_db
def test_reg_my_logs_ok(api_client, auth_header, make_logs):
    make_logs(2)
    res = api_client.get("/api/logs/me", **auth_header)
    assert res.status_code == 200
    body = res.json()
    assert "logs" in body and isinstance(body["logs"], list)
    print(f"Test Passed: /logs/me 200 with "
          f"{len(body['logs'])} items for current user")

# ---------- ADMIN & ALERTS CONTRACTS ----------

@pytest.mark.regression
@pytest.mark.django_db
def test_reg_admin_list_all(api_client, admin_auth_header, make_logs):
    make_logs(2)
    res = api_client.get("/api/logs/admin/all", **admin_auth_header)
    assert res.status_code == 200
    assert isinstance(res.json(), list)
    print("Test Passed: /logs/admin/all 200 for admin")

@pytest.mark.regression
@pytest.mark.django_db
def test_reg_alerts_filters_and_paging(api_client, admin_auth_header, sample_log):
    Alerts.objects.create(log=sample_log, score=0.92, status="open", reason="night email")
    url = "/api/alerts?status=open&page=1&page_size=5&order=score_desc"
    res = api_client.get(url, **admin_auth_header)
    assert res.status_code == 200
    body = res.json()
    for key in ["page", "page_size", "total_items", "total_pages",
                "has_next", "has_prev", "results"]:
        assert key in body
    assert all(set(["id","score","status","created_at","reason","log_id"])
               .issubset(r.keys()) for r in body["results"])
    print(f"Test Passed: /alerts 200 page={body['page']}, items={len(body['results'])}")
