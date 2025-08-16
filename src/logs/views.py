import traceback

from django.http import JsonResponse
from datetime import datetime

from django.utils.dateparse import parse_datetime
from django.utils.decorators import method_decorator
from django.utils.timezone import make_aware
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync
from django.views import View
from django.views.decorators.csrf import csrf_exempt
from django.http import JsonResponse
from django.utils.timezone import make_aware
from datetime import datetime
import joblib, traceback, json
import pandas as pd
# from .models import CustomUser, ActivityLogs, Alerts

from ..mlengine.utils import *


from ThreatDetection.models import *
import pandas as pd
import joblib
from io import TextIOWrapper
import json


@method_decorator(csrf_exempt, name='dispatch')
# @method_decorator(csrf_exempt, name='dispatch')
class AnalyzeLogs(View):
    def post(self, request, *args, **kwargs):
        if not (request.method == 'POST' and request.FILES.get('file')):
            return JsonResponse({'error': 'Submit a POST request with a CSV file under "file".'}, status=400)

        try:
            hybrid_model_bundle = joblib.load('ai_model/final_hybrid_threat_model_daily.pkl')
            scaler = hybrid_model_bundle['scaling_module']
            isolation_model = hybrid_model_bundle['iforest_module']
            random_forest_model = hybrid_model_bundle['random_forest_module']
            expected_features = hybrid_model_bundle['training_input_features']
        except FileNotFoundError:
            return JsonResponse({'error': 'Model file not found.'}, status=500)

        try:
            df = pd.read_csv(TextIOWrapper(request.FILES['file'].file, encoding='utf-8'), on_bad_lines='skip')
            df.columns = [col.strip().lower() for col in df.columns]

            # Case 1: Pre-engineered dataset directly usable for prediction
            if all(col in df.columns for col in expected_features):
                df['timestamp'] = pd.to_datetime(df['timestamp'], errors='coerce')
                df = df.dropna(subset=['timestamp'])

                model_input_df = df[expected_features].fillna(0)
                model_input_scaled = scaler.transform(model_input_df)

                df['isolation_score'] = isolation_model.decision_function(model_input_scaled)
                df['rf_prediction'] = random_forest_model.predict(model_input_df)
                df['rf_confidence'] = random_forest_model.predict_proba(model_input_df)[:, 1]
                df['is_anomaly'] = df['rf_confidence'] > 0.8

                alerts_created = []
                default_user = CustomUser.objects.first()

                for i, row in df.iterrows():
                    log = ActivityLogs.objects.create(
                        user=default_user,
                        activity_type='Pre-aggregated Log',
                        resource_accessed='',
                        action_result='Flagged as suspicious' if row['is_anomaly'] else 'Normal',
                        timestamp=row['timestamp'],
                        is_suspicious=bool(row['is_anomaly']),
                        details='Auto-processed aggregated record'
                    )

                    if row['is_anomaly']:
                        try:
                            shap_reason = generate_shap_reason_for_threat(
                                model=random_forest_model,
                                input_df=model_input_df.iloc[[i]],
                                feature_names=expected_features
                            )
                        except Exception:
                            shap_reason = "⚠️ Unable to generate SHAP explanation"

                        alert = Alerts.objects.create(
                            log=log,
                            score=round(row['isolation_score'], 4),
                            status='open',
                            reason=shap_reason
                        )

                        alerts_created.append({
                            'id': alert.id,
                            'user': row.get('user', 'unknown'),
                            'activity': 'Pre-aggregated',
                            'timestamp': str(row['timestamp']),
                            'score': round(row['isolation_score'], 4),
                            'confidence': round(row['rf_confidence'] * 100, 2),
                            'status': alert.status,
                            'created_at': alert.created_at,
                            'reason': shap_reason
                        })

                        async_to_sync(get_channel_layer().group_send)(
                            "threats",
                            {
                                "type": "send_threat_alert",
                                "data": {
                                    "message": "🚨 Insider threat detected",
                                    "user": row.get('user', 'unknown'),
                                    "activity": 'Pre-aggregated',
                                    "score": round(row['isolation_score'], 4),
                                    "confidence": round(row['rf_confidence'] * 100, 2),
                                    "timestamp": str(row['timestamp']),
                                    "reason": shap_reason
                                }
                            }
                        )

                return JsonResponse({
                    'anomalies': alerts_created,
                    'total_anomalies': len(alerts_created),
                    'info': '✅ Processed pre-engineered logs.'
                })

            else:
                return JsonResponse({'error': 'CSV does not match expected format for raw or engineered logs.'}, status=400)

        except Exception as e:
            return JsonResponse({'error': str(e)}, status=500)


from zoneinfo import ZoneInfo
from django.http import JsonResponse
from django.utils import timezone
import json, traceback, joblib, numpy as np
import pandas as pd
from datetime import datetime
from django.http import JsonResponse
from django.utils.timezone import make_aware
from django.utils.decorators import method_decorator
from django.views import View
from django.views.decorators.csrf import csrf_exempt
from django.db import transaction
from django.utils.dateparse import parse_datetime


from ThreatDetection.inference.feature_builders import (
    build_features_from_agg_and_cohort as build_feats
)
from ThreatDetection.models import (
    CustomUser, ActivityLogs, Alerts,
    UserDailyAgg, ModelConfig
)

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

# --- helpers ---------------------------------------------------------------

def is_night_hour(hour:int, start:int, end:int) -> bool:
    """True if hour is within [start, end) with wrap-around support."""
    if start == end:
        return True  # 24h night (unlikely, but defined)
    return (start <= end and start <= hour < end) or (start > end and (hour >= start or hour < end))

def resolve_eval_tz(user):
    """Pick a timezone to evaluate 'night' and 'day' in."""
    # If you store tz like "Asia/Kathmandu" on the user, use it; else project default.
    user_tz_name = getattr(user, 'timezone', None)
    try:
        return ZoneInfo(user_tz_name) if user_tz_name else timezone.get_current_timezone()
    except Exception:
        return timezone.get_current_timezone()

@method_decorator(csrf_exempt, name='dispatch')
class SingleLogAnalyzer(View):
    def post(self, request):
        try:
            bundle   = joblib.load('ai_model/final_hybrid_threat_model_daily.pkl')
            imputer  = bundle['imputer']
            scaler   = bundle['scaling_module']
            iforest  = bundle['iforest_module']
            model    = bundle['model']
            expected = bundle['training_input_features']
            thr      = float(bundle.get('decision_threshold', 0.6))
        except Exception as e:
            return JsonResponse({'error': f'Model load failed: {e}'}, status=500)

        try:
            data = json.loads(request.body.decode('utf-8')) if request.content_type == 'application/json' else request.POST

            user = CustomUser.objects.filter(id=data.get('user')).first()
            if not user:
                return JsonResponse({'error': 'Invalid user'}, status=400)

            # --- parse timestamp and set tz --------------------------------
            ts_str = data.get('timestamp')  # expect ISO like "2025-08-11T23:41" or "...:41+05:45"
            dt = parse_datetime(ts_str)  # returns aware if offset present
            if dt is None:
                # fallback to naive parse of "YYYY-MM-DDTHH:MM"
                dt = datetime.strptime(ts_str, "%Y-%m-%dT%H:%M")

            eval_tz = resolve_eval_tz(user)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=eval_tz)  # interpret as user's local time

            local_ts = dt.astimezone(eval_tz)           # for night/day + daily rollups
            utc_ts   = local_ts.astimezone(timezone.utc) # for storage if you prefer UTC

            day = local_ts.date()
            act = (data.get('activity') or '').strip()

            # magnitudes for this single event (used for boost and aggregation)
            event_emails = int(data.get('num_emails', 0) or 0)
            event_files  = int(data.get('num_files', 0) or 0)
            event_usbs   = int(data.get('usb_count', 0) or 0)

            # --- compute night using wrap-around on LOCAL hour --------------
            night = is_night_hour(local_ts.hour, NIGHT_START_HOUR, NIGHT_END_HOUR)

            # --- update today's aggregate in LOCAL day ----------------------
            with transaction.atomic():
                agg, _ = UserDailyAgg.objects.select_for_update().get_or_create(user=user, day=day)
                if act == 'email_sent':
                    n = max(0, event_emails)
                    agg.number_of_emails_dispatched += n
                    if night:
                        agg.nighttime_email_events += n
                elif act == 'file_accessed':
                    agg.number_of_files_interacted += max(0, event_files)
                elif act == 'logon':
                    agg.total_logon_attempts += 1
                    if night:
                        agg.number_of_night_logons += 1
                elif act == 'usb_inserted':
                    agg.usb_connection_incidents += max(0, event_usbs)
                agg.save()

            # ------------------ feature build ------------------
            expected_no_if = [c for c in expected if c != 'iforest_score']
            X_base = build_feats(user, local_ts, agg, expected_no_if)  # use local context for daily features

            X_imp   = imputer.transform(X_base)
            X_scl   = scaler.transform(X_imp)
            if_score = float(iforest.decision_function(X_scl)[0])
            X_final  = np.column_stack([X_imp, [if_score]])

            # ------------------ model prob + night boost ------------------
            raw_proba = float(model.predict_proba(X_final)[0, 1])

            boost = 0.0
            is_night_ops = (str(user.role or '').strip().lower() == NIGHTOPS_ROLE_NAME.lower())

            if night and not is_night_ops:
                if act == 'email_sent':
                    boost += EMAIL_BASE_BOOST + EMAIL_PER10_BOOST * (event_emails // 10)
                elif act == 'logon':
                    boost += LOGIN_NIGHT_BOOST

            boost = max(0.0, min(boost, MAX_TOTAL_BOOST))
            adj_proba = max(0.0, min(1.0, raw_proba + boost))

            # ------------------ threshold override ------------------
            cfg = ModelConfig.objects.filter(name='daily_xgb').first()
            if cfg and cfg.decision_threshold is not None:
                thr = float(cfg.decision_threshold)

            is_anom = bool(adj_proba >= thr)

            # ------------------ persist Activity + optional Alert ------------------
            log = ActivityLogs.objects.create(
                user=user,
                activity_type=act,
                resource_accessed='',
                action_result='Flagged as suspicious' if is_anom else 'Normal',
                timestamp=utc_ts,      # store UTC; change to local_ts if you prefer local storage
                is_suspicious=is_anom,
                details='Submitted via UI'
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
                alert_info = {
                    'id': alert.id,
                    'alert_id': alert.id,
                    'score': round(adj_proba, 6),
                    'reason': alert.reason
                }

            return JsonResponse({
                'log_id': log.id,
                'is_anomaly': is_anom,
                'raw_probability': round(raw_proba, 6),
                'applied_boost': round(boost, 6),
                'adjusted_probability': round(adj_proba, 6),
                'probability': round(adj_proba, 6),
                'threshold': round(thr, 6),
                'timestamp': local_ts.strftime('%Y-%m-%d %H:%M:%S'),
                'agg_snapshot': {f: getattr(agg, f) for f in AGG_FEATURES},
                'alert': alert_info
            })

        except Exception as e:
            traceback.print_exc()
            return JsonResponse({'error': str(e)}, status=500)






from .utils import start_session, log_activity, end_session_and_analyze
from django.utils.timezone import now

from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from ThreatDetection.models import CustomUser
from .utils import analyze_and_persist_event

class AnalyzeUserActivity(APIView):

    def post(self, request):
        data = request.data

        uid = data.get('user') or data.get('target_user_id')
        if uid is None:
            return Response({"error": "user is required"}, status=400)

        target_user = CustomUser.objects.filter(id=uid).first()
        if not target_user:
            return Response({"error": "Selected user not found."}, status=400)

        # --- activity + timestamp ---
        act_raw = (data.get('activity') or data.get('activity_type') or '').strip()
        allowed = {'logon', 'logoff', 'email_sent', 'file_accessed', 'usb_inserted'}
        if act_raw not in allowed:
            return Response({"error": f"activity_type must be one of {sorted(allowed)}"}, status=400)
        act = act_raw

        ts = data.get('timestamp')  # "YYYY-MM-DDTHH:MM"
        if not ts:
            return Response({"error": "timestamp is required"}, status=400)

        # --- counts ---
        num_emails = int(data.get('num_emails') or data.get('extra_info', {}).get('count', 0) or 0)
        num_files  = int(data.get('num_files')  or 0)
        usb_count  = int(data.get('usb_count')  or 0)
        count = num_emails if act == 'email_sent' else num_files if act == 'file_accessed' else usb_count



        # --- go through your shared helper (writes ActivityLogs for every event, Alerts when needed) ---
        out = analyze_and_persist_event(
            user=target_user,
            activity_type=act,             # 'logon' | 'logoff' | 'email_sent' | 'file_accessed' | 'usb_inserted'
            timestamp=ts,                  # "YYYY-MM-DDTHH:MM"
            count=count,                   # 0 for logon/logoff
            resource_accessed=data.get('resource_accessed', ''),
            action_result=data.get('action_result', ''),
            details=data.get('details', '')
        )
        return Response(out, status=201)




class EligibleUsersListView(APIView):

    def get(self, request):

        qs = (
            CustomUser.objects
            .filter(is_active=True, is_suspended=False,  is_superuser=False)
            .only("id", "username", "email", "department", "role", "is_active", "is_suspended")
            .order_by("username")
        )

        data = [
            {
                "id": u.id,
                "username": u.username,
                "email": u.email or "",
                "department": u.department or "",
                "role": u.role or "",
                "is_active": bool(u.is_active),
                "is_suspended": bool(u.is_suspended),
            }
            for u in qs
        ]
        return Response(data)
