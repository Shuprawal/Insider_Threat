import traceback

from django.http import JsonResponse
from datetime import datetime
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


from ThreatDetection.models import *
import pandas as pd
import joblib
from io import TextIOWrapper
import json


@method_decorator(csrf_exempt, name='dispatch')
class AnalyzeLogs(View):
    def post(self, request, *args, **kwargs):
        print("Analyzing uploaded logs")

        if request.method == 'POST' and request.FILES.get('file'):
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

                if 'user' not in df.columns:
                    df['user'] = df['from'] if 'from' in df.columns else 'unknown'
                if 'activity' not in df.columns:
                    df['activity'] = 'Unknown'
                if 'date' not in df.columns and 'timestamp' in df.columns:
                    df['date'] = df['timestamp']

                df['timestamp'] = pd.to_datetime(df['date'], errors='coerce')
                df = df.dropna(subset=['timestamp'])
                df['timestamp'] = df['timestamp'].apply(lambda ts: make_aware(ts) if ts.tzinfo is None else ts)

                if df.empty:
                    return JsonResponse({'anomalies': [], 'total_anomalies': 0, 'info': '⚠️ No usable timestamps found.'})

                df['day'] = df['timestamp'].dt.date.astype(str)
                df['hour'] = df['timestamp'].dt.hour

                df_email = df[df['activity'].str.contains('email', case=False)]
                df_file = df[df['activity'].str.contains('file', case=False)]
                df_logon = df[df['activity'].str.contains('logon|login', case=False)]
                df_usb = df[df['activity'].str.contains('usb|device', case=False)]

                df_email_agg = df_email.groupby(['user', 'day']).size().reset_index(name='total_emails_sent')
                df_file_agg = df_file.groupby(['user', 'day']).size().reset_index(name='total_files_accessed')
                df_logon_agg = df_logon.groupby(['user', 'day']).size().reset_index(name='total_logon_sessions')
                df_usb_agg = df_usb.groupby(['user', 'day']).size().reset_index(name='total_usb_activities')

                df_features = df_email_agg.merge(df_file_agg, on=['user', 'day'], how='outer') \
                    .merge(df_logon_agg, on=['user', 'day'], how='outer') \
                    .merge(df_usb_agg, on=['user', 'day'], how='outer')
                df_features.fillna(0, inplace=True)

                night_email_agg = df_email[df_email['hour'].between(0, 6)].groupby(['user', 'day']).size().reset_index(name='nighttime_email_events')
                night_logon_agg = df_logon[df_logon['hour'].between(0, 6)].groupby(['user', 'day']).size().reset_index(name='number_of_night_logons')

                df_features = df_features.merge(night_email_agg, on=['user', 'day'], how='left') \
                    .merge(night_logon_agg, on=['user', 'day'], how='left')
                df_features[['nighttime_email_events', 'number_of_night_logons']] = df_features[
                    ['nighttime_email_events', 'number_of_night_logons']].fillna(0)

                df_features['day_of_week'] = pd.to_datetime(df_features['day']).dt.dayofweek
                df_features['is_weekend'] = df_features['day_of_week'].isin([5, 6]).astype(int)

                df_features.sort_values(['user', 'day'], inplace=True)
                df_features['email_diff_1d'] = df_features.groupby('user')['total_emails_sent'].diff().fillna(0)
                df_features['logon_diff_1d'] = df_features.groupby('user')['total_logon_sessions'].diff().fillna(0)
                df_features['logon_rolling_7d_avg'] = df_features.groupby('user')['total_logon_sessions'].transform(lambda x: x.rolling(7, min_periods=1).mean())
                df_features['logon_to_email_ratio'] = df_features['total_logon_sessions'] / (df_features['total_emails_sent'] + 1)

                df_features.rename(columns={
                    'total_emails_sent': 'number_of_emails_dispatched',
                    'total_files_accessed': 'number_of_files_interacted',
                    'total_logon_sessions': 'total_logon_attempts',
                    'total_usb_activities': 'usb_connection_incidents',
                    'email_diff_1d': 'email_volume_change_1d',
                    'logon_diff_1d': 'logon_variation_1d',
                    'logon_rolling_7d_avg': 'logon_rolling_average_7d',
                    'logon_to_email_ratio': 'logon_to_email_event_ratio',
                    'day_of_week': 'weekday_index',
                    'is_weekend': 'is_weekend_day'
                }, inplace=True)

                for trait in [
                    'trait_openness_score', 'trait_conscientiousness_score', 'trait_extraversion_score',
                    'trait_agreeableness_score', 'trait_neuroticism_score'
                ]:
                    df_features[trait] = 0

                model_input_df = df_features[expected_features].fillna(0)
                model_input_scaled = scaler.transform(model_input_df)

                df_features['isolation_score'] = isolation_model.decision_function(model_input_scaled)
                df_features['rf_prediction'] = random_forest_model.predict(model_input_df)
                df_features['rf_confidence'] = random_forest_model.predict_proba(model_input_df)[:, 1]
                df_features['is_anomaly'] = df_features['rf_prediction'] == 1

                df_combined = df_features.merge(df[['user', 'timestamp', 'activity']], on='user', how='left')
                alerts_created = []

                for _, row in df_combined.iterrows():
                    default_user = CustomUser.objects.first()
                    log = ActivityLogs.objects.create(
                        user=default_user,
                        activity_type=row['activity'],
                        resource_accessed='',
                        action_result='Flagged as suspicious' if row['is_anomaly'] else 'Normal',
                        timestamp=row['timestamp'],
                        is_suspicious=bool(row['is_anomaly']),
                        details=f"Auto-processed: {row['activity']}"
                    )

                    if row['is_anomaly']:
                        alert = Alerts.objects.create(
                            log=log,
                            score=round(abs(row['isolation_score']), 4),
                            status='open'
                        )
                        alerts_created.append({
                            'id': alert.id,
                            'user': row['user'],
                            'activity': row['activity'],
                            'timestamp': str(row['timestamp']),
                            'score': round(abs(row['isolation_score']), 4),
                            'confidence': round(row['rf_confidence'] * 100, 2),
                            'status': alert.status,
                            'created_at': alert.created_at,
                        })

                        channel_layer = get_channel_layer()
                        async_to_sync(channel_layer.group_send)(
                            "threats",
                            {
                                "type": "send_threat_alert",
                                "data": {
                                    "message": "\ud83d\udea8 Insider threat detected",
                                    "user": row['user'],
                                    "activity": row['activity'],
                                    "score": round(abs(row['isolation_score']), 4),
                                    "confidence": round(row['rf_confidence'] * 100, 2),
                                    "timestamp": str(row['timestamp'])
                                }
                            }
                        )

                return JsonResponse({
                    'anomalies': alerts_created,
                    'total_anomalies': len(alerts_created),
                    'total_logged_activities': len(df_combined)
                })

            except Exception as e:
                return JsonResponse({'error': str(e)}, status=500)

        return JsonResponse({'error': 'Submit a POST request with a CSV file under "file".'}, status=400)



@method_decorator(csrf_exempt, name='dispatch')
class SingleLogAnalyzer(View):
    def get(self, request):
        users = CustomUser.objects.filter(
            is_suspended=False,
            role__iexact='admin'
        ).exclude(role__iexact='admin') \
         .values('id', 'username')

        return JsonResponse(list(users), safe=False)

    def post(self, request):
        print('a')
        try:
            # Load model
            hybrid_model_bundle = joblib.load('ai_model/final_hybrid_threat_model_daily.pkl')
            scaler = hybrid_model_bundle['scaling_module']
            isolation_model = hybrid_model_bundle['iforest_module']
            random_forest_model = hybrid_model_bundle['random_forest_module']
            expected_features = hybrid_model_bundle['training_input_features']
        except FileNotFoundError:
            return JsonResponse({'error': 'Model file not found.'}, status=500)

        try:
            if request.content_type == 'application/json':
                data = json.loads(request.body.decode('utf-8'))
            else:
                data = request.POST

            print("Parsed Data:", data)
            user_id = data.get('user')
            user_obj = CustomUser.objects.filter(id=user_id).first()
            if not user_obj:
                return JsonResponse({'error': 'Invalid user'}, status=400)

            activity = data.get('activity')
            timestamp_str = data.get('timestamp')
            timestamp = make_aware(datetime.strptime(timestamp_str, "%Y-%m-%dT%H:%M"))

            # Construct synthetic daily log dataframe for model
            feature_row = {
                'user': user_obj.username,
                'day': timestamp.date().isoformat(),
                'number_of_emails_dispatched': int(data.get('num_emails', 0)),
                'number_of_files_interacted': int(data.get('num_files', 0)),
                'total_logon_attempts': 1 if activity == 'logon' else 0,
                'usb_connection_incidents': int(data.get('usb_count', 0)),
                'nighttime_email_events': 1 if activity == 'email_sent' and 0 <= timestamp.hour < 6 else 0,
                'number_of_night_logons': 1 if activity == 'logon' and 0 <= timestamp.hour < 6 else 0,
                'weekday_index': timestamp.weekday(),
                'is_weekend_day': int(timestamp.weekday() in [5, 6]),
                'email_volume_change_1d': 0,
                'logon_variation_1d': 0,
                'logon_rolling_average_7d': 0,
                'logon_to_email_event_ratio': 0
            }

            # Add dummy psych traits
            for trait in [
                'trait_openness_score', 'trait_conscientiousness_score', 'trait_extraversion_score',
                'trait_agreeableness_score', 'trait_neuroticism_score'
            ]:
                feature_row[trait] = 0

            df_features = pd.DataFrame([feature_row])
            model_input_df = df_features[expected_features].fillna(0)
            model_input_scaled = scaler.transform(model_input_df)

            isolation_score = isolation_model.decision_function(model_input_scaled)[0]
            prediction = random_forest_model.predict(model_input_df)[0]
            confidence = random_forest_model.predict_proba(model_input_df)[0][1]
            is_anomaly = bool(prediction == 1)

            # Save to ActivityLogs
            log = ActivityLogs.objects.create(
                user=user_obj,
                activity_type=activity,
                resource_accessed='',
                action_result='Flagged as suspicious' if is_anomaly else 'Normal',
                timestamp=timestamp,
                is_suspicious=is_anomaly,
                details='Single activity submitted manually'
            )

            alert_info = None
            if is_anomaly:
                alert = Alerts.objects.create(
                    log=log,
                    score=round(abs(isolation_score), 4),
                    status='open'
                )
                alert_info = {
                    'alert_id': alert.id,
                    'score': round(abs(isolation_score), 4),
                    'confidence': round(confidence * 100, 2),
                    'status': str(alert.status)
                }

            return JsonResponse({
                'log_id': log.id,
                'is_anomaly': is_anomaly,
                'activity': activity,
                'timestamp': timestamp.strftime('%Y-%m-%d %H:%M:%S'),
                'confidence': round(confidence * 100, 2),
                'isolation_score': round(isolation_score, 4),
                'alert': alert_info
            })

        except Exception as e:
            print("❌ Exception occurred:", str(e))
            traceback.print_exc()
            return JsonResponse({'error': str(e)}, status=500)