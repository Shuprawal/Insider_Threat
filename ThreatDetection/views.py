from django.db.models import Count, Avg
from django.db.models.functions import ExtractHour
from django.views.decorators.csrf import csrf_exempt
from django.http import JsonResponse
from .models import CustomUser, ActivityLogs, Alerts
from .serializers import ActivityLogSerializer
import json, secrets
import joblib
from io import TextIOWrapper
import pandas as pd
from sklearn.preprocessing import StandardScaler
import hashlib
import os

from django.views.decorators.csrf import csrf_exempt
from django.http import JsonResponse
from io import TextIOWrapper
import pandas as pd
import joblib
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync
from .models import CustomUser, ActivityLogs, Alerts
from django.http import JsonResponse
# from .auth_utils import get_user_from_auth_token
from ThreatDetection.auth_utils import *
from django.shortcuts import render
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from .models import ActivityLogs, Alerts, CustomUser
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync
from io import TextIOWrapper
import pandas as pd
import joblib
from django.utils.timezone import now, localtime

SESSION_STORE = {}


from django.http import JsonResponse

from django.views.decorators.csrf import csrf_exempt
from django.http import JsonResponse
from django.utils import timezone
from datetime import datetime
from io import TextIOWrapper
import pandas as pd



# @csrf_exempt
from django.utils.timezone import make_aware
from django.utils import timezone
from datetime import datetime
from django.http import JsonResponse
from django.utils.timezone import make_aware
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync
from .models import CustomUser, ActivityLogs, Alerts
import pandas as pd
import joblib
from io import TextIOWrapper


@csrf_exempt
# def analyze_uploaded_logs(request):
#     if request.method == 'POST' and request.FILES.get('file'):
#         file = request.FILES['file']
#         try:
#             df = pd.read_csv(file)
#             anomalies = []
#
#             for _, row in df.iterrows():
#                 timestamp = pd.to_datetime(row['timestamp'], errors='coerce')
#                 if pd.isna(timestamp):
#                     continue
#
#                 hour = timestamp.hour
#                 activity = row['activity'].lower()
#
#                 # Very basic rule-based detection
#                 if activity in ['usb_inserted', 'file_accessed'] and (hour >= 0 and hour <= 5):
#                     anomalies.append({
#                         "user": row['user'],
#                         "activity": row['activity'],
#                         "timestamp": row['timestamp'],
#                         "confidence": 75,  # Dummy confidence score
#                         "score": 0.85      # Dummy model score
#                     })
#
#             return JsonResponse({"anomalies": anomalies})
#         except Exception as e:
#             return JsonResponse({"error": str(e)}, status=500)
#
#     return JsonResponse({"error": "Invalid request"}, status=400)

def analyze_uploaded_logs(request):
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


# def analyze_uploaded_logs(request):
#     print("Analyzing uploaded logs")
#
#     if request.method == 'POST' and request.FILES.get('file'):
#         try:
#             # Load trained hybrid model
#             hybrid_model_bundle = joblib.load('ai_model/final_hybrid_threat_model_daily.pkl')
#             scaler = hybrid_model_bundle['scaling_module']
#             isolation_model = hybrid_model_bundle['iforest_module']
#             random_forest_model = hybrid_model_bundle['random_forest_module']
#             expected_features = hybrid_model_bundle['training_input_features']
#         except FileNotFoundError:
#             return JsonResponse({'error': 'Model file not found.'}, status=500)
#
#         try:
#             # Read uploaded CSV
#             df = pd.read_csv(TextIOWrapper(request.FILES['file'].file, encoding='utf-8'), on_bad_lines='skip')
#             df.columns = [col.strip().lower() for col in df.columns]
#
#             if 'user' not in df.columns:
#                 df['user'] = df['from'] if 'from' in df.columns else 'unknown'
#             if 'activity' not in df.columns:
#                 df['activity'] = 'Unknown'
#             if 'date' not in df.columns and 'timestamp' in df.columns:
#                 df['date'] = df['timestamp']
#
#             df['timestamp'] = pd.to_datetime(df['date'], errors='coerce')
#
#             # Convert to timezone-aware datetimes
#             df['timestamp'] = df['timestamp'].apply(lambda ts: make_aware(ts) if ts.tzinfo is None else ts)
#
#             df = df.dropna(subset=['timestamp'])
#
#             if df.empty:
#                 return JsonResponse({'anomalies': [], 'total_anomalies': 0, 'info': '⚠️ No usable timestamps found.'})
#
#             df['day'] = df['timestamp'].dt.date.astype(str)
#             df['hour'] = df['timestamp'].dt.hour
#
#             # Filter by activity
#             df_email = df[df['activity'].str.contains('email', case=False)]
#             df_file = df[df['activity'].str.contains('file', case=False)]
#             df_logon = df[df['activity'].str.contains('logon|login', case=False)]
#             df_usb = df[df['activity'].str.contains('usb|device', case=False)]
#
#             df_email_agg = df_email.groupby(['user', 'day']).size().reset_index(name='total_emails_sent')
#             df_file_agg = df_file.groupby(['user', 'day']).size().reset_index(name='total_files_accessed')
#             df_logon_agg = df_logon.groupby(['user', 'day']).size().reset_index(name='total_logon_sessions')
#             df_usb_agg = df_usb.groupby(['user', 'day']).size().reset_index(name='total_usb_activities')
#
#             df_features = df_email_agg.merge(df_file_agg, on=['user', 'day'], how='outer') \
#                 .merge(df_logon_agg, on=['user', 'day'], how='outer') \
#                 .merge(df_usb_agg, on=['user', 'day'], how='outer')
#             df_features.fillna(0, inplace=True)
#
#             night_email_agg = df_email[df_email['hour'].between(0, 6)].groupby(['user', 'day']).size().reset_index(name='nighttime_email_events')
#             night_logon_agg = df_logon[df_logon['hour'].between(0, 6)].groupby(['user', 'day']).size().reset_index(name='number_of_night_logons')
#
#             df_features = df_features.merge(night_email_agg, on=['user', 'day'], how='left') \
#                                      .merge(night_logon_agg, on=['user', 'day'], how='left')
#             df_features[['nighttime_email_events', 'number_of_night_logons']] = df_features[['nighttime_email_events', 'number_of_night_logons']].fillna(0)
#
#             df_features['day_of_week'] = pd.to_datetime(df_features['day']).dt.dayofweek
#             df_features['is_weekend'] = df_features['day_of_week'].isin([5, 6]).astype(int)
#
#             df_features.sort_values(['user', 'day'], inplace=True)
#             df_features['email_diff_1d'] = df_features.groupby('user')['total_emails_sent'].diff().fillna(0)
#             df_features['logon_diff_1d'] = df_features.groupby('user')['total_logon_sessions'].diff().fillna(0)
#             df_features['logon_rolling_7d_avg'] = df_features.groupby('user')['total_logon_sessions'].transform(lambda x: x.rolling(7, min_periods=1).mean())
#             df_features['logon_to_email_ratio'] = df_features['total_logon_sessions'] / (df_features['total_emails_sent'] + 1)
#
#             df_features.rename(columns={
#                 'total_emails_sent': 'number_of_emails_dispatched',
#                 'total_files_accessed': 'number_of_files_interacted',
#                 'total_logon_sessions': 'total_logon_attempts',
#                 'total_usb_activities': 'usb_connection_incidents',
#                 'email_diff_1d': 'email_volume_change_1d',
#                 'logon_diff_1d': 'logon_variation_1d',
#                 'logon_rolling_7d_avg': 'logon_rolling_average_7d',
#                 'logon_to_email_ratio': 'logon_to_email_event_ratio',
#                 'day_of_week': 'weekday_index',
#                 'is_weekend': 'is_weekend_day'
#             }, inplace=True)
#
#             for trait in [
#                 'trait_openness_score', 'trait_conscientiousness_score', 'trait_extraversion_score',
#                 'trait_agreeableness_score', 'trait_neuroticism_score'
#             ]:
#                 df_features[trait] = 0
#
#             model_input_df = df_features[expected_features].fillna(0)
#             model_input_scaled = scaler.transform(model_input_df)
#
#             df_features['isolation_score'] = isolation_model.decision_function(model_input_scaled)
#             df_features['rf_prediction'] = random_forest_model.predict(model_input_df)
#             df_features['rf_confidence'] = random_forest_model.predict_proba(model_input_df)[:, 1]
#             df_features['is_anomaly'] = df_features['rf_prediction'] == 1
#
#             df_combined = df_features.merge(df[['user', 'timestamp', 'activity']], on='user', how='left')
#             alerts_created = []
#
#             for _, row in df_combined.iterrows():
#                 default_user = CustomUser.objects.first()
#
#                 log = ActivityLogs.objects.create(
#                     user=default_user,
#                     activity_type=row['activity'],
#                     resource_accessed='',
#                     action_result='Flagged as suspicious' if row['is_anomaly'] else 'Normal',
#                     timestamp=row['timestamp'],
#                     is_suspicious=bool(row['is_anomaly']),
#                     details=f"Auto-processed: {row['activity']}"
#                 )
#
#                 if row['is_anomaly']:
#                     alert = Alerts.objects.create(
#                         log=log,
#                         score=round(abs(row['isolation_score']), 4),
#                         status='open'
#                     )
#                     alerts_created.append({
#                         'id': alert.id,
#                         'user': row['user'],
#                         'activity': row['activity'],
#                         'timestamp': str(row['timestamp']),
#                         'score': round(abs(row['isolation_score']), 4),
#                         'confidence': round(row['rf_confidence'] * 100, 2),
#                         'status': alert.status,
#                         'created_at': alert.created_at,
#                     })
#
#                     # WebSocket alert
#                     channel_layer = get_channel_layer()
#                     async_to_sync(channel_layer.group_send)(
#                         "threats",
#                         {
#                             "type": "send_threat_alert",
#                             "data": {
#                                 "message": "🚨 Insider threat detected",
#                                 "user": row['user'],
#                                 "activity": row['activity'],
#                                 "score": round(abs(row['isolation_score']), 4),
#                                 "confidence": round(row['rf_confidence'] * 100, 2),
#                                 "timestamp": str(row['timestamp'])
#                             }
#                         }
#                     )
#
#             return JsonResponse({
#                 'anomalies': alerts_created,
#                 'total_anomalies': len(alerts_created),
#                 'total_logged_activities': len(df_combined)
#             })
#
#         except Exception as e:
#             return JsonResponse({'error': str(e)}, status=500)
#
#     return JsonResponse({'error': 'Submit a POST request with a CSV file under "file".'}, status=400)



from ThreatDetection.models import Alerts, CustomUser
import jwt
from django.conf import settings


def get_authenticated_user(request):
    auth_header = request.headers.get('Authorization', '')
    print("🔐 Authorization Header:", auth_header)

    if not auth_header.startswith('Bearer '):
        print("❌ Invalid or missing Bearer token")
        return None

    token = auth_header.replace('Bearer ', '')
    print("🔑 Token extracted:", token)

    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
        user_id = payload.get("user_id")
        print("🧠 Matched user ID:", user_id)

        if not user_id:
            return None

        return CustomUser.objects.filter(id=user_id).first()

    except jwt.ExpiredSignatureError:
        print("❌ Token expired")
        return None

    except jwt.DecodeError:
        print("❌ Invalid token")
        return None

    except Exception as e:
        print(f"❌ Unexpected error: {e}")
        return None


@csrf_exempt
def user_list(request):
    if request.method == 'GET':
        users = CustomUser.objects.all().values('id', 'username')
        return JsonResponse(list(users), safe=False)
    return JsonResponse({'error': 'Only GET allowed'}, status=405)




def fetch_activity_logs_for_user(request):
    user = get_user_from_auth_token(request)
    if not user:
        return JsonResponse({'error': 'Unauthorized'}, status=401)

    logs = ActivityLogs.objects.filter(user=user)
    return JsonResponse({'logs': list(logs.values())})


#  Custom Login
@csrf_exempt

def custom_login(request):
    if request.method == 'POST':
        try:
            data = json.loads(request.body)
            entered_username = data.get('username')
            entered_password = data.get('password')

            if not entered_username or not entered_password:
                return JsonResponse({'error': 'Username and password required'}, status=400)

            try:
                user = CustomUser.objects.get(username=entered_username)
            except CustomUser.DoesNotExist:
                return JsonResponse({'error': 'User not found'}, status=404)

            # Manually hash the entered password
            entered_hash = hashlib.sha256(entered_password.encode()).hexdigest()

            if entered_hash != user.password:
                return JsonResponse({'error': 'Invalid credentials'}, status=401)

            # ✅ Generate JWT token
            print("📌 User ID:", user.id)
            token = generate_auth_token(user)

            return JsonResponse({'token': token})

        except json.JSONDecodeError:
            return JsonResponse({'error': 'Invalid JSON'}, status=400)

    return JsonResponse({'error': 'Invalid request method'}, status=405)

    # if request.method == 'POST':
    #     try:
    #         data = json.loads(request.body)
    #         username = data.get('username')
    #         password = data.get('password')
    #
    #         user = CustomUser.objects.filter(username=username).first()
    #         if user and user.check_password(password):
    #             token = secrets.token_hex(32)
    #             SESSION_STORE[token] = user.id
    #             return JsonResponse({'success': True, 'token': token})
    #         return JsonResponse({'success': False, 'error': 'Invalid credentials'}, status=401)
    #     except Exception as e:
    #         return JsonResponse({'success': False, 'error': str(e)}, status=400)
    # return JsonResponse({'error': 'Only POST allowed'}, status=405)

#  Custom Register
# @csrf_exempt
# def custom_register(request):
#     if request.method == 'POST':
#         try:
#             data = json.loads(request.body)
#             username = data.get('username')
#             email = data.get('email')
#             password = data.get('password')
#             department = data.get('department', '')
#             role = data.get('role', 'employee')
#
#             if not email:
#                 return JsonResponse({'error': 'Email is required'}, status=400)
#
#             # Check for unique email
#             if CustomUser.objects.filter(email=email).exists():
#                 return JsonResponse({'error': 'Email already registered'}, status=400)
#             if CustomUser.objects.filter(username=username).exists():
#                 return JsonResponse({'error': 'User already exists'}, status=400)
#
#             user = CustomUser(
#                 username=username,
#                 email=email,  # Add email here
#                 department=department,
#                 role=role
#             )
#             user.set_password(password)
#             user.save()
#             return JsonResponse({'success': True})
#         except Exception as e:
#             print("❌ Registration error:", str(e))  # optional debug
#             return JsonResponse({'error': str(e)}, status=400)
#     return JsonResponse({'error': 'Only POST allowed'}, status=405)



@csrf_exempt
def custom_log_create(request):
    if request.method == 'POST':
        requesting_user = get_authenticated_user(request)
        if not requesting_user:
            return JsonResponse({'error': 'Unauthorized'}, status=401)

        try:
            data = json.loads(request.body)
            print("📥 Received data:", data)

            # Resolve user to instance
            selected_user_id = data.get('user')
            if requesting_user.role == 'admin' and selected_user_id:
                # Try to fetch the user from DB
                try:
                    selected_user = CustomUser.objects.get(id=selected_user_id)
                except CustomUser.DoesNotExist:
                    return JsonResponse({'error': 'Selected user not found'}, status=404)
            else:
                selected_user = requesting_user

            # Remove 'user' from data to avoid conflict in serializer
            data.pop('user', None)

            # Pass user instance directly in save()
            serializer = ActivityLogSerializer(data=data)
            if serializer.is_valid():
                serializer.save(user=selected_user)
                return JsonResponse(serializer.data, status=201)
            print("❌ Serializer errors:", serializer.errors)
            return JsonResponse(serializer.errors, status=400)

        except Exception as e:
            print("❌ Exception in log create:", str(e))
            return JsonResponse({'error': str(e)}, status=500)

    return JsonResponse({'error': 'Only POST allowed'}, status=405)



@csrf_exempt
def custom_log_list(request):
    if request.method == 'GET':
        user = get_authenticated_user(request)
        if not user:
            return JsonResponse({'error': 'Unauthorized'}, status=401)
        logs = ActivityLogs.objects.filter(user=user).order_by('-timestamp')
        serializer = ActivityLogSerializer(logs, many=True)
        return JsonResponse(serializer.data, safe=False)
    return JsonResponse({'error': 'Only GET allowed'}, status=405)

# views.py
# @csrf_exempt
# def custom_log_list_all(request):
#     auth_user = get_authenticated_user(request)
#     if not auth_user or auth_user.role != 'admin':
#         return JsonResponse({'error': 'Unauthorized'}, status=401)
#     logs = ActivityLogs.objects.all().order_by('-timestamp')
#     serializer = ActivityLogSerializer(logs, many=True)
#     return JsonResponse(serializer.data, safe=False)

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from ThreatDetection.authentication import CustomTokenAuthentication


class CustomLogListAllView(APIView):
    authentication_classes = [CustomTokenAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not request.user.role == 'admin':
            return Response({'error': 'Unauthorized'}, status=401)

        logs = ActivityLogs.objects.all().order_by('-timestamp')
        serializer = ActivityLogSerializer(logs, many=True)
        return Response(serializer.data)


from django.views.decorators.csrf import csrf_exempt
from django.http import JsonResponse
from ThreatDetection.models import Alerts

@csrf_exempt
def alerts_list(request):
    auth_user = get_authenticated_user(request)
    if not auth_user or auth_user.role != 'admin':
        return JsonResponse({'error': 'Unauthorized'}, status=401)

    if request.method == 'GET':
        alerts = Alerts.objects.select_related('log').order_by('-created_at')
        data = [
            {
                "id": alert.id,
                # "message": alert.message,
                "created_at": alert.created_at.strftime("%Y-%m-%d %H:%M:%S"),
                "log": alert.log_id
            }
            for alert in alerts
        ]
        return JsonResponse(data, safe=False)

    return JsonResponse({'error': 'Method not allowed'}, status=405)


@csrf_exempt
def hybrid_user_level_threat_detection(request):
    print("hybrid_user_level_threat_detection")
    if request.method != 'GET':
        return JsonResponse({'error': 'Only GET allowed'}, status=405)

    try:
        import joblib
        import pandas as pd
        from sklearn.preprocessing import StandardScaler

        # Load hybrid model
        # model_data = joblib.load('ai_trained_model/hybrid_threat_model.pkl')
        model_data = joblib.load('ai_model/final_hybrid_threat_model_daily.pkl')
        scaler = model_data['scaler']
        isolation_model = model_data['isolation_model']
        random_model = model_data['random_forest_model']
        features_used = model_data['features']

        # Load & process datasets (email, file, logon, device, psychometric)
        base_path = "Datasets/"
        email = pd.read_csv(base_path + "email.csv")
        file = pd.read_csv(base_path + "file.csv")
        logon = pd.read_csv(base_path + "logon.csv")
        usb = pd.read_csv(base_path + "device.csv")
        psych1 = pd.read_csv(base_path + "psychometric.csv")
        psych2 = pd.read_csv(base_path + "psychometric 2.csv")

        psych = pd.concat([psych1, psych2], ignore_index=True)
        psych.columns = [
            'user_employee_full_name', 'user_unique_identifier',
            'personality_trait_openness', 'personality_trait_conscientiousness',
            'personality_trait_extraversion', 'personality_trait_agreeableness',
            'personality_trait_neuroticism'
        ]

        for df in [email, file, logon, usb]:
            df['date'] = pd.to_datetime(df['date'], errors='coerce')

        email_agg = email.groupby('user').agg(total_emails_sent=('id', 'count')).reset_index()
        file_agg = file.groupby('user').agg(total_files_accessed=('id', 'count')).reset_index()
        logon_agg = logon.groupby('user').agg(total_logon_sessions=('id', 'count')).reset_index()
        usb_agg = usb.groupby('user').agg(total_usb_activities=('id', 'count')).reset_index()

        user_df = email_agg \
            .merge(file_agg, on='user', how='outer') \
            .merge(logon_agg, on='user', how='outer') \
            .merge(usb_agg, on='user', how='outer') \
            .merge(psych, left_on='user', right_on='user_unique_identifier', how='left') \
            .fillna(0)

        X = user_df[features_used]
        X_scaled = scaler.transform(X)
        iso_labels = isolation_model.predict(X_scaled)
        user_df['isolation_label'] = (iso_labels == -1).astype(int)
        user_df['isolation_score'] = isolation_model.decision_function(X_scaled)

        # Predict using trained Random Forest model
        user_df['rf_prediction'] = random_model.predict(X_scaled)

        suspicious = user_df[user_df['rf_prediction'] == 1]

        return JsonResponse({
            'total_users': len(user_df),
            'threats_detected': len(suspicious),
            'top_suspicious_users': suspicious[['user', 'isolation_score'] + features_used].sort_values(by='isolation_score').head(10).to_dict(orient='records')
        })

    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)









#
# def get_threat_chart_data(request):
#     today = now().date()
#     current_time = now().replace(minute=0, second=0, microsecond=0)
#     start_time = current_time.replace(hour=0)
#
#     # Line Chart — Hourly Threat Confidence Score
#     hourly_scores = (
#         Alerts.objects
#         .filter(log__timestamp__date=today)
#         .annotate(hour=Count('log__timestamp__hour'))
#         .values('log__timestamp__hour')
#         .annotate(avg_score=Avg('score'))
#         .order_by('log__timestamp__hour')
#     )
#
#     all_hours = [f"{h:02}:00" for h in range(24)]
#     hour_score_map = {
#         f"{entry['log__timestamp__hour']:02}:00": round(entry['avg_score'], 2)
#         for entry in hourly_scores
#     }
#     hour_scores = [hour_score_map.get(hour, 0) for hour in all_hours]
#
#     # Pie Chart — Top Suspicious Activities
#     pie_data = (
#         ActivityLogs.objects
#         .filter(is_suspicious=True, timestamp__date=today)
#         .values('activity_type')
#         .annotate(count=Count('id'))
#         .order_by('-count')[:5]
#     )
#     pie_labels = [entry['activity_type'] for entry in pie_data]
#     pie_counts = [entry['count'] for entry in pie_data]
#
#     # Bar Chart — Top Suspicious Users
#     suspicious_users = (
#         ActivityLogs.objects
#         .filter(is_suspicious=True, timestamp__date=today)
#         .values('user__username')
#         .annotate(count=Count('id'))
#         .order_by('-count')[:5]
#     )
#     bar_labels = [entry['user__username'] or 'Unknown' for entry in suspicious_users]
#     bar_counts = [entry['count'] for entry in suspicious_users]
#
#     return JsonResponse({
#         'hourLabels': all_hours,
#         'hourScores': hour_scores,
#         'pieLabels': pie_labels,
#         'pieData': pie_counts,
#         'barLabels': bar_labels,
#         'barCounts': bar_counts,
#     })


@csrf_exempt
def get_all_logs(request):
    print('aa')
    logs = ActivityLogs.objects.select_related('user').order_by('-timestamp')[:50]
    data = []

    for log in logs:
        data.append({
            'user': log.user.username,
            'activity_type': log.activity_type,
            'timestamp': localtime(log.timestamp).strftime("%Y-%m-%d %H:%M:%S"),
            'is_suspicious': log.is_suspicious,
        })
        # print(data)

    return JsonResponse({'logs': data})