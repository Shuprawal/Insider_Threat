# tests/test_serializers_unit.py
import pytest
from ThreatDetection.serializers import ActivityLogSerializer
from ThreatDetection.models import ActivityLogs

def test_activity_log_serializer_rejects_missing_required_fields(user):
    serializer = ActivityLogSerializer(data={"activity_type": "login"})
    is_valid = serializer.is_valid()
    assert not is_valid, ("Serializer should reject "
                          "when required fields are missing")
    print("Test Passed: ActivityLogSerializer rejected "
          "incomplete payload with errors:", serializer.errors)

def test_activity_log_serializer_accepts_valid_payload(db, user):
    payload = {
        "activity_type": "login",
        "resource_accessed": "",
        "action_result": "success",
        "timestamp": "2024-01-01T00:00:00Z",
        "is_suspicious": False,
        "details": "ok"
    }
    s = ActivityLogSerializer(data=payload)
    assert s.is_valid(), f"Serializer should be valid. Errors: {s.errors}"
    obj = s.save(user=user)
    assert isinstance(obj, ActivityLogs), "Save should create ActivityLogs instance"
    assert obj.user_id == user.id, "Saved log must be linked to provided user on save()"
    print("Test Passed: ActivityLogSerializer created ActivityLogs with user_id =", obj.user_id)
