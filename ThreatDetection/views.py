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



SESSION_STORE = {}

@csrf_exempt
def analyze_uploaded_logs(request):
    if request.method == 'POST' and request.FILES.get('file'):
        try:
            hybrid_model_bundle_loaded_from_disk = joblib.load('ai_model/hybrid_threat_model.pkl')
            isolation_forest_model_used_for_scoring = hybrid_model_bundle_loaded_from_disk['isolation_model']
            random_forest_model_used_for_labeling = hybrid_model_bundle_loaded_from_disk['random_forest_model']
            feature_scaler_for_uploaded_logs = hybrid_model_bundle_loaded_from_disk['scaler']
            expected_input_feature_columns_list = hybrid_model_bundle_loaded_from_disk['features']

        except FileNotFoundError:
            return JsonResponse({'error': 'Trained hybrid model file not found in ai_model directory.'}, status=500)

        try:
            user_uploaded_log_file_object = request.FILES['file']
            uploaded_dataframe_raw_logs = pd.read_csv(
                TextIOWrapper(user_uploaded_log_file_object.file, encoding='utf-8'),
                on_bad_lines='skip'
            )

            uploaded_dataframe_raw_logs.columns = [col.strip().lower() for col in uploaded_dataframe_raw_logs.columns]

            if 'user' not in uploaded_dataframe_raw_logs.columns:
                uploaded_dataframe_raw_logs['user'] = uploaded_dataframe_raw_logs['from'] if 'from' in uploaded_dataframe_raw_logs.columns else 'unknown'

            if 'activity' not in uploaded_dataframe_raw_logs.columns:
                uploaded_dataframe_raw_logs['activity'] = 'Unknown'

            if 'date' not in uploaded_dataframe_raw_logs.columns and 'timestamp' in uploaded_dataframe_raw_logs.columns:
                uploaded_dataframe_raw_logs['date'] = uploaded_dataframe_raw_logs['timestamp']

            uploaded_dataframe_raw_logs['timestamp'] = pd.to_datetime(uploaded_dataframe_raw_logs['date'], errors='coerce')
            uploaded_dataframe_raw_logs = uploaded_dataframe_raw_logs.dropna(subset=['timestamp'])

            if uploaded_dataframe_raw_logs.empty:
                return JsonResponse({
                    'anomalies': [],
                    'total_anomalies': 0,
                    'total_alerts': 0,
                    'info': 'Uploaded file did not contain any valid rows with usable timestamps.'
                })

            uploaded_dataframe_raw_logs['hour'] = uploaded_dataframe_raw_logs['timestamp'].dt.hour
            uploaded_dataframe_raw_logs['day'] = uploaded_dataframe_raw_logs['timestamp'].dt.dayofweek
            uploaded_dataframe_raw_logs['activity_code'] = uploaded_dataframe_raw_logs['activity'].astype('category').cat.codes
            uploaded_dataframe_raw_logs['user_code'] = uploaded_dataframe_raw_logs['user'].astype('category').cat.codes

            extracted_features_for_model_input = uploaded_dataframe_raw_logs[expected_input_feature_columns_list].fillna(0)
            scaled_feature_matrix_for_prediction = feature_scaler_for_uploaded_logs.transform(extracted_features_for_model_input)

            uploaded_dataframe_raw_logs['isolation_score'] = isolation_forest_model_used_for_scoring.decision_function(scaled_feature_matrix_for_prediction)
            uploaded_dataframe_raw_logs['rf_prediction'] = random_forest_model_used_for_labeling.predict(scaled_feature_matrix_for_prediction)
            uploaded_dataframe_raw_logs['is_anomaly'] = uploaded_dataframe_raw_logs['rf_prediction'] == 1

            final_dataframe_only_anomalies = uploaded_dataframe_raw_logs[uploaded_dataframe_raw_logs['is_anomaly'] == True]
            alert_entries_created_for_anomalies = []

            if final_dataframe_only_anomalies.empty:
                return JsonResponse({
                    'anomalies': [],
                    'total_anomalies': 0,
                    'total_alerts': 0,
                    'info': '✅ No suspicious user activity patterns found in uploaded logs.'
                })

            for _, suspicious_row in final_dataframe_only_anomalies.iterrows():
                fallback_selected_user_instance = CustomUser.objects.first()
                new_log_instance_flagged_as_suspicious = ActivityLogs.objects.create(
                    user=fallback_selected_user_instance,
                    activity_type=suspicious_row['activity'],
                    resource_accessed='',
                    action_result='Flagged as suspicious',
                    timestamp=suspicious_row['timestamp'],
                    is_suspicious=True,
                    details=f"⚠️ Suspicious activity auto-detected in uploaded logs (user: {suspicious_row['user']})"
                )
                newly_generated_alert_entry = Alerts.objects.create(
                    log=new_log_instance_flagged_as_suspicious,
                    score=round(abs(suspicious_row['isolation_score']), 4),
                    status='open'
                )
                alert_entries_created_for_anomalies.append({
                    'id': newly_generated_alert_entry.id,
                    'score': newly_generated_alert_entry.score,
                    'status': newly_generated_alert_entry.status,
                    'created_at': newly_generated_alert_entry.created_at,
                })

                # Broadcast WebSocket notification
                channel_layer = get_channel_layer()
                async_to_sync(channel_layer.group_send)(
                    "threats",
                    {
                        "type": "send_threat_alert",
                        "data": {
                            "message": "🚨 New insider threat detected!",
                            "user": suspicious_row['user'],
                            "score": round(abs(suspicious_row['isolation_score']), 4),
                            "timestamp": str(suspicious_row['timestamp']),
                            "activity": suspicious_row['activity']
                        }
                    }
                )

            return JsonResponse({
                'anomalies': final_dataframe_only_anomalies[['user', 'activity', 'date']].to_dict(orient='records'),
                'total_anomalies': len(final_dataframe_only_anomalies),
                'total_alerts': len(alert_entries_created_for_anomalies),
                'alerts_created': alert_entries_created_for_anomalies
            })

        except Exception as unexpected_exception_instance:
            return JsonResponse({'error': str(unexpected_exception_instance)}, status=500)

    return JsonResponse({'error': 'Please submit a POST request with a valid CSV log file as "file".'}, status=400)


# def analyze_uploaded_logs(request):
#     if request.method == 'POST' and request.FILES.get('file'):
#         try:
#             model_data = joblib.load('ai_model/hybrid_threat_model.pkl')
#             isolation_model = model_data['isolation_model']
#             random_model = model_data['random_forest_model']
#             scaler = model_data['scaler']
#             features = model_data['features']
#
#         except FileNotFoundError:
#             return JsonResponse({'error': 'Model file not found'}, status=500)
#
#         try:
#             uploaded_file = request.FILES['file']
#             df = pd.read_csv(TextIOWrapper(uploaded_file.file, encoding='utf-8'), on_bad_lines='skip')
#             df.columns = [c.strip().lower() for c in df.columns]
#
#             if 'user' not in df.columns:
#                 df['user'] = df['from'] if 'from' in df.columns else 'unknown'
#             if 'activity' not in df.columns:
#                 df['activity'] = 'Unknown'
#             if 'date' not in df.columns and 'timestamp' in df.columns:
#                 df['date'] = df['timestamp']
#
#             df['timestamp'] = pd.to_datetime(df['date'], errors='coerce')
#             df = df.dropna(subset=['timestamp'])
#
#             if df.empty:
#                 return JsonResponse({'anomalies': [], 'total_anomalies': 0, 'total_alerts': 0, 'info': 'No valid logs found in file.'})
#
#             df['hour'] = df['timestamp'].dt.hour
#             df['day'] = df['timestamp'].dt.dayofweek
#             df['activity_code'] = df['activity'].astype('category').cat.codes
#             df['user_code'] = df['user'].astype('category').cat.codes
#
#             features = df[['hour', 'day', 'activity_code', 'user_code']].fillna(0)
#             X_scaled = scaler.transform(features)
#             df['is_anomaly'] = model.predict(X_scaled) == -1
#             df['score'] = model.decision_function(X_scaled)
#
#             anomalies = df[df['is_anomaly']]
#             created_alerts = []
#
#             if anomalies.empty:
#                 return JsonResponse({
#                     'anomalies': [],
#                     'total_anomalies': 0,
#                     'total_alerts': 0,
#                     'info': 'No suspicious activity detected.'
#                 })
#
#             for _, row in anomalies.iterrows():
#                 user_instance = CustomUser.objects.first()  # fallback for demo
#                 log = ActivityLogs.objects.create(
#                     user=user_instance,
#                     activity_type=row['activity'],
#                     resource_accessed='',
#                     action_result='Flagged as suspicious',
#                     timestamp=row['timestamp'],
#                     is_suspicious=True,
#                     details=f"Auto-detected anomaly from uploaded log (user: {row['user']})"
#                 )
#                 alert = Alerts.objects.create(
#                     log=log,
#                     score=round(abs(row['score']), 4),
#                     status='open'
#                 )
#                 created_alerts.append({
#                     'id': alert.id,
#                     'score': alert.score,
#                     'status': alert.status,
#                     'created_at': alert.created_at,
#                 })
#
#             return JsonResponse({
#                 'anomalies': anomalies[['user', 'activity', 'date']].to_dict(orient='records'),
#                 'total_anomalies': len(anomalies),
#                 'total_alerts': len(created_alerts),
#                 'alerts_created': created_alerts
#             })
#
#         except Exception as e:
#             return JsonResponse({'error': str(e)}, status=500)
#
#     return JsonResponse({'error': 'POST a log file as "file"'}, status=400)
#



# def get_authenticated_user(request):
#     auth_header = request.headers.get('Authorization', '')
#     print("🔐 Authorization Header:", auth_header)
#     token = auth_header.replace('Bearer ', '')
#     print("🔑 Token extracted:", token)
#     user_id = SESSION_STORE.get(token)
#     print("🧠 Matched user ID:", user_id)
#     if not user_id:
#         return None
#     return CustomUser.objects.filter(id=user_id).first()

from django.http import JsonResponse
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
@csrf_exempt
def custom_register(request):
    if request.method == 'POST':
        try:
            data = json.loads(request.body)
            username = data.get('username')
            password = data.get('password')
            department = data.get('department', '')
            role = data.get('role', 'employee')

            if CustomUser.objects.filter(username=username).exists():
                return JsonResponse({'error': 'User already exists'}, status=400)

            user = CustomUser(
                username=username,
                department=department,
                role=role
            )
            user.set_password(password)
            user.save()
            return JsonResponse({'success': True})
        except Exception as e:
            print("❌ Registration error:", str(e))  # optional debug
            return JsonResponse({'error': str(e)}, status=400)
    return JsonResponse({'error': 'Only POST allowed'}, status=405)


#  Create Activity Log Entry

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
from rest_framework.authentication import BasicAuthentication  # fallback
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
# def alerts_list(request):
#     auth_user = get_authenticated_user(request)
#     if not auth_user or auth_user.role != 'admin':
#         return JsonResponse({'error': 'Unauthorized'}, status=401)
#
#     if request.method == 'GET':
#         alerts = Alerts.objects.select_related('log').order_by('-created_at')
#         data = [
#             {
#                 'id': alert.id,
#                 'score': alert.score,
#                 'status': alert.status,
#                 'created_at': alert.created_at,
#                 'user': alert.log.user.username if alert.log and alert.log.user else 'Unknown',
#                 'notes': alert.notes,
#             }
#             for alert in alerts
#         ]
#         return JsonResponse(data, safe=False)
#
#     return JsonResponse({'error': 'Only GET allowed'}, status=405)




@csrf_exempt
def hybrid_user_level_threat_detection(request):
    if request.method != 'GET':
        return JsonResponse({'error': 'Only GET allowed'}, status=405)

    try:
        import joblib
        import pandas as pd
        from sklearn.preprocessing import StandardScaler

        # Load hybrid model
        model_data = joblib.load('ai_model/hybrid_threat_model.pkl')
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




from rest_framework.views import APIView
from rest_framework.response import Response

class AllLogsView(APIView):
    print('aaa')
    def get(self, request):
        print('bbb')
        return Response({"message": "Logs fetched successfully"})