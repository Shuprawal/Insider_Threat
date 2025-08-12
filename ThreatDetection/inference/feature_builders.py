# ThreatDetection/inference/feature_builders.py

from datetime import timedelta
import numpy as np
import pandas as pd
from django.utils.timezone import now
from ThreatDetection.models import UserDailyAgg, CohortBaseline

AGG_FEATURES = [
    'number_of_emails_dispatched','total_logon_attempts',
    'number_of_files_interacted','usb_connection_incidents',
    'nighttime_email_events','number_of_night_logons'
]

def _mad(arr):
    med = np.median(arr)
    return float(np.median(np.abs(arr - med)))

def _personal_stats(user, asof_day, lookback_days=30):
    qs = (UserDailyAgg.objects
          .filter(user=user, day__lt=asof_day, day__gte=asof_day - timedelta(days=lookback_days))
          .values(*AGG_FEATURES))
    rows = list(qs)
    if len(rows) < 10:   # NOT enough personal history
        return None
    stats = {}
    for f in AGG_FEATURES:
        vals = np.array([r[f] for r in rows], dtype=float)
        stats[f] = dict(median=float(np.median(vals)), mad=_mad(vals))
    return stats

def _cohort_stats(role, dept):
    out = {}
    for f in AGG_FEATURES:
        try:
            b = CohortBaseline.objects.get(cohort_role=role, cohort_department=dept, feature_name=f)
        except CohortBaseline.DoesNotExist:
            try:
                b = CohortBaseline.objects.get(cohort_role='*', cohort_department='*', feature_name=f)
            except CohortBaseline.DoesNotExist:
                out[f] = dict(median=0.0, mad=1.0)
                continue
        out[f] = dict(median=b.median, mad=(b.mad if b.mad > 0 else 1.0))
    return out

def build_features_from_agg_and_cohort(user, ts, agg_row, expected_no_if):
    # ---- raw features from today’s aggregate ----
    base = {
        'number_of_emails_dispatched': float(agg_row.number_of_emails_dispatched),
        'number_of_files_interacted':  float(agg_row.number_of_files_interacted),
        'total_logon_attempts':        float(agg_row.total_logon_attempts),
        'usb_connection_incidents':    float(agg_row.usb_connection_incidents),
        'nighttime_email_events':      float(agg_row.nighttime_email_events),
        'number_of_night_logons':      float(agg_row.number_of_night_logons),
        'trait_openness_score': 0.0, 'trait_conscientiousness_score': 0.0,
        'trait_extraversion_score': 0.0, 'trait_agreeableness_score': 0.0,
        'trait_neuroticism_score': 0.0,
        'weekday_index': ts.weekday(),
        'is_weekend_day': int(ts.weekday() in (5,6)),
        'hour': ts.hour, 'month': ts.month,
        'is_business_hours': int(8 <= ts.hour <= 18),
        'is_late_night': int(ts.hour <= 5 or ts.hour >= 23),
        # zero’d history windows (online)
        'email_volume_change_1d':0.0,'logon_variation_1d':0.0,'logon_rolling_average_7d':0.0,
        'email_volume_volatility_3d':0.0,'logon_volatility_3d':0.0,
        **{f'{f}_mean_{w}d':0.0 for f in ['number_of_emails_dispatched','total_logon_attempts','number_of_files_interacted','usb_connection_incidents'] for w in (7,14,30)},
        **{f'{f}_std_{w}d':0.0 for f in ['number_of_emails_dispatched','total_logon_attempts','number_of_files_interacted','usb_connection_incidents'] for w in (7,14,30)},
        'email_delta_7d':0.0,'email_delta_14d':0.0,'email_delta_30d':0.0,
        'logon_delta_7d':0.0,'logon_delta_14d':0.0,'logon_delta_30d':0.0,
    }

    # ratios & interactions
    base['usb_to_logon_ratio']  = base['usb_connection_incidents']/(base['total_logon_attempts']+1.0)
    base['file_to_email_ratio'] = base['number_of_files_interacted']/(base['number_of_emails_dispatched']+1.0)
    total_evt = base['number_of_emails_dispatched'] + base['total_logon_attempts']
    base['night_activity_ratio']   = (base['nighttime_email_events'] + base['number_of_night_logons'])/(total_evt+1.0)
    base['after_hours_logon_ratio']= base['number_of_night_logons']/(base['total_logon_attempts']+1.0)
    base['files_per_logon']        = base['number_of_files_interacted']/(base['total_logon_attempts']+1.0)
    base['usb_after_hours']        = float(base['usb_connection_incidents']*base['is_late_night'])
    base['neuroticism_x_night']    = base['trait_neuroticism_score']*base['night_activity_ratio']

    # ---- robust z-scores: prefer personal, else cohort, else global ----
    personal = _personal_stats(user, agg_row.day)
    if personal:
        stats = personal
    else:
        stats = _cohort_stats(user.role or '*', user.department or '*')

    for f in ['number_of_emails_dispatched','total_logon_attempts','number_of_files_interacted','usb_connection_incidents']:
        med = stats.get(f,{}).get('median',0.0)
        mad = stats.get(f,{}).get('mad',1.0)
        base[f'user_rz_{f}'] = (base[f] - med) / (1.4826*(mad if mad>0 else 1e-6))

    # deltas vs 7d cohort mean if you later store it; leave 0 for now

    # ---- order & fill ----
    X = pd.DataFrame([base])
    for c in expected_no_if:
        if c not in X.columns: X[c] = 0.0
    return X[expected_no_if].astype(float)
