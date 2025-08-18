
import pandas as pd
import joblib
import json
import hashlib
from .serializers import ActivityLogSerializer
from ThreatDetection.auth_utils import *
from django.utils.timezone import now, localtime
from django.utils.timezone import make_aware
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync
from .models import CustomUser, ActivityLogs, Alerts
from io import TextIOWrapper
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST
from .auth_utils import generate_auth_token

# threatDetection/views
SESSION_STORE = {}

@csrf_exempt
@require_POST
def custom_login(request):
    try:
        # Determine how to parse incoming credentials
        request_content_type_detailed = request.content_type or ""
        if "application/json" in request_content_type_detailed:
            incoming_login_payload_data = json.loads(request.body.decode("utf-8") or "{}")
        else:
            incoming_login_payload_data = request.POST.dict()

        # Extract username/email and password
        provided_login_identifier = (
            incoming_login_payload_data.get("identifier")
            or incoming_login_payload_data.get("username")
            or incoming_login_payload_data.get("email")
            or ""
        ).strip()

        provided_login_password = (incoming_login_payload_data.get("password") or "").strip()

        # Basic validation
        if not provided_login_identifier or not provided_login_password:
            return JsonResponse({"error": "Username and password required"}, status=400)

        # Try to fetch the user by email or username
        try:
            if "@" in provided_login_identifier:
                matched_user_instance = CustomUser.objects.get(email__iexact=provided_login_identifier)
            else:
                matched_user_instance = CustomUser.objects.get(username__iexact=provided_login_identifier)
        except CustomUser.DoesNotExist:
            return JsonResponse({"error": "User not found"}, status=404)

        # Check active status
        if not matched_user_instance.is_active:
            return JsonResponse({"error": "User account is inactive. To activate check your email"}, status=401)


        # Check suspension status
        if matched_user_instance.is_suspended:
            return JsonResponse({"error": "User account is suspended. Contact administrator."}, status=403)

        # Validate password (your SHA256 check)
        computed_password_hash_value = hashlib.sha256(provided_login_password.encode()).hexdigest()
        if computed_password_hash_value != matched_user_instance.password:
            return JsonResponse({"error": "Invalid credentials"}, status=401)

        # Generate JWT token
        generated_authentication_token = generate_auth_token(matched_user_instance)

        # Decide redirect path based on role
        user_role_cleaned_value = (matched_user_instance.role or "").strip().lower()
        if user_role_cleaned_value == "admin":
            redirect_target_path = "/"
        else:
            redirect_target_path = "/employee/dashboard"

        # Prepare user data for frontend storage
        serialized_user_data = {
            "id": matched_user_instance.id,
            "username": matched_user_instance.username,
            "email": matched_user_instance.email,
            "role": matched_user_instance.role,
            "first_name": matched_user_instance.first_name,
            "last_name": matched_user_instance.last_name,
        }

        return JsonResponse(
            {
                "token": generated_authentication_token,
                "user": serialized_user_data,
                "redirect_to": redirect_target_path,
            },
            status=200,
        )

    except json.JSONDecodeError:
        return JsonResponse({"error": "Invalid JSON"}, status=400)









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
    print(" Token extracted:", token)

    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
        user_id = payload.get("user_id")
        print(" Matched user ID:", user_id)

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


from datetime import datetime
from django.http import JsonResponse
from django.utils import timezone
from django.utils.dateparse import parse_date
from django.views.decorators.csrf import csrf_exempt
from django.core.paginator import Paginator, EmptyPage
from django.db.models import Q

from ThreatDetection.models import Alerts
# from .auth_utils import get_authenticated_user  # use your existing helper

def _aware(dt):
    return dt if timezone.is_aware(dt) else timezone.make_aware(dt, timezone.get_current_timezone())

def _coerce_user(u):
    """
    Returns a normalized dict for either:
    - FK user model instance, or
    - plain string username (CharField on ActivityLogs.user), or
    - None
    """
    if u is None:
        return None
    if isinstance(u, str):
        return {"id": None, "username": u}
    # model instance
    return {
        "id": getattr(u, "id", None),
        "username": getattr(u, "username", None) or getattr(u, "userName", None),
        "email": getattr(u, "email", None),
        "department": getattr(u, "department", None),
        "role": getattr(u, "role", None),
    }

def _serialize_alert(a):
    # actor who generated the log (FK or string)
    actor_user = getattr(a.log, "user", None)
    return {
        "id": a.id,
        "score": float(a.score) if a.score is not None else 0.0,
        "status": a.status or "open",
        "created_at": timezone.localtime(a.created_at).strftime("%Y-%m-%d %H:%M:%S"),
        "reason": a.reason or "",
        "log_id": a.log_id,
        "user": _coerce_user(actor_user),
        "assigned_to": _coerce_user(getattr(a, "assigned_to", None)),
    }

@csrf_exempt
def alerts_list(request):
    auth_user = get_authenticated_user(request)
    # if not auth_user or getattr(auth_user, "role", None) != "admin":
    #     return JsonResponse({"error": "Unauthorized"}, status=401)

    if request.method != "GET":
        return JsonResponse({"error": "Method not allowed"}, status=405)

    # ---------- incoming params ----------
    start_date_str = request.GET.get("start_date")
    end_date_str   = request.GET.get("end_date")
    status_param   = (request.GET.get("status") or "all").lower()   # open | closed | all
    q              = (request.GET.get("q") or "").strip()           # search reason / user / assigned
    try:
        page = max(1, int(request.GET.get("page", 1)))
    except ValueError:
        page = 1
    try:
        page_size = int(request.GET.get("page_size", 12))
    except ValueError:
        page_size = 12
    page_size = max(1, min(page_size, 100))

    order = (request.GET.get("order") or "created_desc").lower()
    order_map = {
        "created_desc": "-created_at",
        "created_asc": "created_at",
        "score_desc": "-score",
        "score_asc": "score",
    }
    order_by = order_map.get(order, "-created_at")

    # ---------- queryset ----------
    # Be tolerant if ActivityLogs.user is a CharField (not a relation).
    try:
        qs = Alerts.objects.select_related("assigned_to", "log", "log__user")
    except Exception:
        qs = Alerts.objects.select_related("assigned_to", "log")

    qs = qs.order_by(order_by)

    # date range (YYYY-MM-DD)
    if start_date_str and end_date_str:
        sd = parse_date(start_date_str)
        ed = parse_date(end_date_str)
        if sd and ed:
            start_dt = _aware(datetime.combine(sd, datetime.min.time()))
            end_dt   = _aware(datetime.combine(ed, datetime.max.time()))
            qs = qs.filter(created_at__range=(start_dt, end_dt))

    # status filter
    if status_param in ("open", "closed"):
        qs = qs.filter(status=status_param)

    # basic search (safe fields). We search reason and assigned_to fields.
    if q:
        qs = qs.filter(
            Q(reason__icontains=q) |
            Q(assigned_to__username__icontains=q) |
            Q(assigned_to__email__icontains=q)
        )

    # ---------- pagination ----------
    paginator = Paginator(qs, page_size)
    try:
        page_obj = paginator.page(page)
    except EmptyPage:
        page_obj = paginator.page(paginator.num_pages)

    results = [_serialize_alert(a) for a in page_obj.object_list]



    return JsonResponse({
        "page": page_obj.number,
        "page_size": page_size,
        "total_items": paginator.count,
        "total_pages": paginator.num_pages,
        "has_next": page_obj.has_next(),
        "has_prev": page_obj.has_previous(),
        "results": results,
    })



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











@csrf_exempt
def get_all_logs(request):
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