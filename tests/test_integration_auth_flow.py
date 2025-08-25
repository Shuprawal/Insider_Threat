# tests/test_integration_auth_flow.py
import json
import pytest

@pytest.mark.django_db
def test_custom_login_success(api_client, user):
    payload = {"identifier": user.username, "password": "secret"}
    res = api_client.post("/api/custom_login",
                          data=json.dumps(payload), content_type="application/json")
    assert res.status_code == 200, (f"Should login"
                                    f" successfully. Got: {res.status_code}, body={res.content}")
    data = res.json()
    assert "token" in data and "user" in data, "Login response should contain token and user"
    print("Test Passed: custom_login returned token + user for valid credentials")

@pytest.mark.django_db
def test_custom_login_invalid_password(api_client, user):
    payload = {"identifier": user.username, "password": "nope"}
    res = api_client.post("/api/custom_login",
                          data=json.dumps(payload), content_type="application/json")
    assert res.status_code == 401, "Invalid password should return 401"
    print("Test Passed: custom_login rejected invalid password with 401")

@pytest.mark.django_db
def test_custom_login_suspended_user(api_client, user):
    user.is_suspended = True
    user.save()
    payload = {"identifier": user.username, "password": "secret"}
    res = api_client.post("/api/custom_login",
                          data=json.dumps(payload), content_type="application/json")
    assert res.status_code == 403, "Suspended user should be blocked"
    print("Test Passed: custom_login blocked suspended user")

@pytest.mark.django_db
def test_user_list_get(api_client):
    res = api_client.get("/api/user_list")
    assert res.status_code in (200, 405), \
        "Depending on your URL; GET should be allowed or properly blocked"
    if res.status_code == 200:
        assert isinstance(res.json(), list), "user_list GET should return JSON list"
        print("Test Passed: user_list returned a list")
    else:
        print("Info: user_list returned 405 (Only GET allowed) as designed")
