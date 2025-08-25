# tests/test_models_other.py
import datetime as dt
import pytest
from django.utils import timezone
from django.db import IntegrityError


from ThreatDetection.models import PasswordResetToken


@pytest.mark.django_db
def test_password_reset_token_expiry(user):
    token = PasswordResetToken.objects.create(
        user=user,
        token="abc123",
        created_at=timezone.now(),
        expires_at=timezone.now() + dt.timedelta(minutes=1),
        used=False
    )
    assert token.is_expired() is False, "Token should not be expired initially"
    token.expires_at = timezone.now() - dt.timedelta(seconds=1)
    token.save()
    assert token.is_expired() is True, "Token should report expired after time passes"
    print("Test Passed: PasswordResetToken.is_expired() works")

@pytest.mark.django_db
def test_user_daily_agg_unique_constraint(user):
    from ThreatDetection.models import UserDailyAgg
    day = dt.date(2024, 1, 1)
    UserDailyAgg.objects.create(user=user, day=day)
    with pytest.raises(IntegrityError):
        UserDailyAgg.objects.create(user=user, day=day)
    print("Test Passed: UserDailyAgg unique_together(user, day) enforced")

@pytest.mark.django_db
def test_cohort_baseline_unique(user):
    from ThreatDetection.models import CohortBaseline
    CohortBaseline.objects.create(
        cohort_role="employee", cohort_department="IT", feature_name="night_logons"
    )
    with pytest.raises(IntegrityError):
        CohortBaseline.objects.create(
            cohort_role="employee", cohort_department="IT", feature_name="night_logons"
        )
    print("Test Passed: CohortBaseline unique_together enforced")

@pytest.mark.django_db
def test_model_config_str():
    from ThreatDetection.models import ModelConfig
    m = ModelConfig.objects.create(name="daily_xgb_v1", bundle_path="/tmp/x")
    assert str(m) == "daily_xgb_v1"
    print("Test Passed: ModelConfig.__str__ correct")

@pytest.mark.django_db
def test_threat_rules_str():
    from ThreatDetection.models import ThreatRules
    r = ThreatRules.objects.create(activity_type="usb_insert",
                                   score_threshold=0.8, description="USB rule")
    assert str(r) == "Rule: usb_insert"
    print("Test Passed: ThreatRules.__str__ correct")

@pytest.mark.django_db
def test_alerts_relation(sample_log, user):
    from ThreatDetection.models import Alerts
    a = Alerts.objects.create(log=sample_log, score=0.91,
                              status="open", reason="suspicious pattern")
    assert a.log_id == sample_log.id, "Alert must point to its ActivityLog"
    assert a.status == "open"
    print("Test Passed: Alerts links to ActivityLog "
          "and stores status/score/reason")
