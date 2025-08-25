# tests/test_integration_admin_alerts.py
import pytest
from django.utils import timezone
from ThreatDetection.models import Alerts

@pytest.mark.django_db
def test_custom_log_list_all_admin_only(api_client, admin_auth_header, make_logs):
    make_logs(3)
    res = api_client.get("/api/logs/admin/all", **admin_auth_header)
    assert res.status_code == 200, "Admin should access list-all endpoint"
    items = res.json()
    assert isinstance(items, list) and len(items) >= 1
    print("Test Passed: Admin can list all logs")

@pytest.mark.django_db
def test_alerts_list_filters_and_pagination(api_client, admin, user, admin_auth_header, sample_log):
    Alerts.objects.create(log=sample_log, score=0.92, status="open", reason="night email")
    res = api_client.get("/api/alerts?status=open&page=1&page_size=5&order=score_desc",
                         **admin_auth_header)
    assert res.status_code == 200, f"Expected 200. Got {res.status_code}"
    data = res.json()
    assert {"page", "total_items", "results"} <= set(data.keys())
    assert all("score" in r and "status" in r for r in data["results"]),\
        "Each alert item should be serialized"
    print(f"Test Passed: alerts_list returned {data['total_items']} items;"
          f" page {data['page']}/{data['total_pages']}")
