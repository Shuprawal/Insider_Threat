# logs/utils.py
from datetime import datetime, date
from django.utils.timezone import make_aware
import joblib
import numpy as np
import pandas as pd

from ThreatDetection.models import UserDailyAgg, ModelConfig, CustomUser
from ThreatDetection.inference.feature_builders import (
    build_features_from_agg_and_cohort as build_feats
)

# ---- time helpers -------------------------------------------------
def is_night_time(ts):
    """Night window used across the app (00:00–05:59)."""
    h = ts.hour
    return 0 <= h < 6

def _dt_from_payload(val):
    """
    Accepts either timezone-aware dt, naive dt (assumes local), or an ISO string
    like '2025-08-10T01:05'. Returns an aware datetime.
    """
    if isinstance(val, datetime):
        return val if val.tzinfo else make_aware(val)
    if isinstance(val, str):
        return make_aware(datetime.strptime(val, "%Y-%m-%dT%H:%M"))
    # fallback: now
    from django.utils.timezone import now
    return now()

# ---- session-ish helpers (no SessionEvent model needed) ----------
def start_session(user, when=None):
    """
    Ensure there is a UserDailyAgg row for the calendar day of 'when'
    (defaults to today). We DON'T reset counts; we accumulate for that day.
    """
    ts = _dt_from_payload(when) if when else _dt_from_payload(None)
    agg, _ = UserDailyAgg.objects.get_or_create(user=user, day=ts.date())
    return agg

def log_activity(user, activity_type, extra_info=None):
    """
    Increment daily aggregates for the user's calendar day of the provided timestamp.
    No separate SessionEvent table; we just keep totals for that day.
    """
    extra_info = extra_info or {}
    ts = _dt_from_payload(extra_info.get("timestamp"))
    agg, _ = UserDailyAgg.objects.get_or_create(user=user, day=ts.date())

    if activity_type == 'email_sent':
        n = int(extra_info.get('count', 1))
        agg.number_of_emails_dispatched += n
        if is_night_time(ts):
            agg.nighttime_email_events += n

    elif activity_type == 'file_accessed':
        agg.number_of_files_interacted += int(extra_info.get('count', 1))

    elif activity_type == 'usb_inserted':
        agg.usb_connection_incidents += int(extra_info.get('count', 1))

    elif activity_type == 'logon':
        agg.total_logon_attempts += 1
        if is_night_time(ts):
            agg.number_of_night_logons += 1

    agg.save()
    return agg





def end_session_and_analyze(user, when=None):
    """
    Build the *same* feature vector used in training (via build_feats),
    append IsolationForest score, then get model probability and compare to threshold.
    """
    ts = _dt_from_payload(when) if when else _dt_from_payload(None)
    agg = UserDailyAgg.objects.get(user=user, day=ts.date())

    # --- load model bundle + runtime config ---
    cfg = ModelConfig.objects.filter(name='daily_xgb').first()
    bundle_path = (cfg.bundle_path if cfg else 'ai_model/final_hybrid_threat_model_daily.pkl')
    bundle = joblib.load(bundle_path)

    imputer  = bundle['imputer']
    scaler   = bundle['scaling_module']
    iforest  = bundle['iforest_module']
    model    = bundle['model']                          # <-- not 'random_forest_module'
    expected = bundle['training_input_features']        # includes 'iforest_score' at the end
    thr      = float((cfg.decision_threshold if (cfg and cfg.decision_threshold is not None)
                      else bundle.get('decision_threshold', 0.6)))

    # --- build the base features exactly as training expected (minus IF score) ---
    expected_no_if = [c for c in expected if c != 'iforest_score']
    X_base = build_feats(user, ts, agg, expected_no_if)   # DataFrame (1, n)

    # --- impute/scale/IF score ---
    X_imp = imputer.transform(X_base)                    # numpy (1, n)
    X_scl = scaler.transform(X_imp)
    if_score = float(iforest.decision_function(X_scl)[0])

    # --- final matrix = [imputed base | iforest_score] ---
    X_final = np.column_stack([X_imp, [if_score]])

    # --- probability from classifier ---
    proba = float(model.predict_proba(X_final)[0, 1])
    is_anom = bool(proba >= thr)

    return {
        "is_anomaly": is_anom,
        "probability": proba,
        "threshold": thr,
        "iforest_score": if_score
    }



from zoneinfo import ZoneInfo
from django.db import transaction
from django.db.models import F
from django.utils import timezone
from django.utils.timezone import make_aware
from datetime import datetime
import joblib, numpy as np

from ThreatDetection.inference.feature_builders import (
    build_features_from_agg_and_cohort as build_feats
)
from ThreatDetection.models import ActivityLogs, UserDailyAgg, Alerts, ModelConfig

# --- same knobs your SingleLogAnalyzer uses ---
AGG_FEATURES = [
    'number_of_emails_dispatched','number_of_files_interacted',
    'total_logon_attempts','usb_connection_incidents',
    'nighttime_email_events','number_of_night_logons'
]
NIGHTOPS_ROLE_NAME = "NightOps"
NIGHT_START_HOUR   = 22          # inclusive
NIGHT_END_HOUR     = 6           # exclusive
EMAIL_BASE_BOOST   = 0.15
EMAIL_PER10_BOOST  = 0.05
LOGIN_NIGHT_BOOST  = 0.05
MAX_TOTAL_BOOST    = 0.35

def is_night_hour(hour:int, start:int, end:int) -> bool:
    if start == end:
        return True
    return (start <= end and start <= hour < end) or (start > end and (hour >= start or hour < end))

def resolve_eval_tz(user):
    tz_name = getattr(user, 'timezone', None)
    try:
        return ZoneInfo(tz_name) if tz_name else timezone.get_current_timezone()
    except Exception:
        return timezone.get_current_timezone()

def _parse_ts_for_user(ts_str, user):
    """
    Accepts ISO like 'YYYY-MM-DDTHH:MM' or with offset.
    Returns (local_ts, utc_ts, local_date)
    """
    from django.utils.dateparse import parse_datetime
    dt = parse_datetime(ts_str) if ts_str else None
    if dt is None and ts_str:
        dt = datetime.strptime(ts_str, "%Y-%m-%dT%H:%M")  # naive
    if dt is None:
        dt = timezone.now()

    eval_tz = resolve_eval_tz(user)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=eval_tz)  # interpret as user's local time

    local_ts = dt.astimezone(eval_tz)
    utc_ts   = local_ts.astimezone(timezone.utc)
    return local_ts, utc_ts, local_ts.date()

def _load_bundle_and_threshold():
    bundle = joblib.load('ai_model/final_hybrid_threat_model_daily.pkl')
    imputer  = bundle['imputer']
    scaler   = bundle['scaling_module']
    iforest  = bundle['iforest_module']
    model    = bundle['model']
    expected = bundle['training_input_features']
    thr      = float(bundle.get('decision_threshold', 0.6))
    cfg = ModelConfig.objects.filter(name='daily_xgb').first()
    if cfg and cfg.decision_threshold is not None:
        thr = float(cfg.decision_threshold)
    return imputer, scaler, iforest, model, expected, thr

@transaction.atomic
def analyze_and_persist_event(
    *, user, activity_type, timestamp=None,
    count=1, resource_accessed="", action_result="", details=""
):
    """
    1) Upsert & increment UserDailyAgg (local day)
    2) Build features (same as training), compute IF score
    3) Predict proba, apply night boosts (non-NightOps)
    4) Persist ActivityLogs (+ is_suspicious) and Alerts if triggered
    5) Return analysis + agg snapshot + alert (if any)
    """
    local_ts, utc_ts, day = _parse_ts_for_user(timestamp, user)
    night = is_night_hour(local_ts.hour, NIGHT_START_HOUR, NIGHT_END_HOUR)
    is_night_ops = (str(user.role or '').strip().lower() == NIGHTOPS_ROLE_NAME.lower())

    # ---- 1) Aggregate upsert + increments (atomic) ----
    agg, _ = UserDailyAgg.objects.select_for_update().get_or_create(user=user, day=day)

    c = max(0, int(count or 0))
    if activity_type == "email_sent":
        UserDailyAgg.objects.filter(pk=agg.pk).update(
            number_of_emails_dispatched=F("number_of_emails_dispatched") + c,
            nighttime_email_events=F("nighttime_email_events") + (c if night else 0),
        )
    elif activity_type == "file_accessed":
        UserDailyAgg.objects.filter(pk=agg.pk).update(
            number_of_files_interacted=F("number_of_files_interacted") + c,
        )
    elif activity_type == "usb_inserted":
        UserDailyAgg.objects.filter(pk=agg.pk).update(
            usb_connection_incidents=F("usb_connection_incidents") + c,
        )
    elif activity_type == "logon":
        UserDailyAgg.objects.filter(pk=agg.pk).update(
            total_logon_attempts=F("total_logon_attempts") + 1,
            number_of_night_logons=F("number_of_night_logons") + (1 if night else 0),
        )
    # 'logoff' or others: no counters, but still score on the current aggregate

    agg.refresh_from_db()

    # ---- 2) Build features / IF score ----
    imputer, scaler, iforest, model, expected, thr = _load_bundle_and_threshold()
    expected_no_if = [c for c in expected if c != 'iforest_score']
    X_base = build_feats(user, local_ts, agg, expected_no_if)
    X_imp  = imputer.transform(X_base)
    X_scl  = scaler.transform(X_imp)
    if_score = float(iforest.decision_function(X_scl)[0])
    X_final  = np.column_stack([X_imp, [if_score]])

    # ---- 3) Predict + night boost (non-NightOps) ----
    raw_proba = float(model.predict_proba(X_final)[0, 1])

    boost = 0.0
    if night and not is_night_ops:
        if activity_type == "email_sent":
            boost += EMAIL_BASE_BOOST + EMAIL_PER10_BOOST * (c // 10)
        elif activity_type == "logon":
            boost += LOGIN_NIGHT_BOOST

    boost = max(0.0, min(boost, MAX_TOTAL_BOOST))
    adj_proba = max(0.0, min(1.0, raw_proba + boost))
    is_anom = bool(adj_proba >= thr)

    # ---- 4) Persist ActivityLogs and Alerts ----
    log = ActivityLogs.objects.create(
        user=user,
        activity_type=activity_type,
        resource_accessed=resource_accessed or "",
        action_result=action_result or ("Flagged as suspicious" if is_anom else "Normal"),
        timestamp=utc_ts,        # storing UTC
        is_suspicious=is_anom,
        details=details or "",
    )

    alert_info = None
    if is_anom:
        bits = [f"raw={raw_proba:.4f}", f"boost={boost:.3f}", f"adj={adj_proba:.4f}", f"thr={thr:.4f}"]
        if night and not is_night_ops:
            bits.append("night-boost(non-NightOps)")
        alert = Alerts.objects.create(
            log=log,
            score=adj_proba,
            status='open',
            reason="; ".join(bits)
        )
        alert_info = {"id": alert.id, "score": round(adj_proba,6), "reason": alert.reason}

    return {
        "log_id": log.id,
        "analysis": {
            "is_anomaly": is_anom,
            "raw_probability": round(raw_proba, 6),
            "applied_boost": round(boost, 6),
            "adjusted_probability": round(adj_proba, 6),
            "probability": round(adj_proba, 6),
            "threshold": round(thr, 6),
            "iforest_score": round(if_score, 6),
            "timestamp": local_ts.strftime('%Y-%m-%d %H:%M:%S'),
        },
        "agg_snapshot": {f: getattr(agg, f) for f in AGG_FEATURES},
        "alert": alert_info,
        "day": str(agg.day)
    }
