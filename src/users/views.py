import os
import secrets
import re

from django.contrib.auth.tokens import default_token_generator
from django.core.mail import send_mail, EmailMultiAlternatives
from django.core.paginator import Paginator
from django.http import JsonResponse
from django.shortcuts import redirect
from django.template.loader import render_to_string
from django.utils.decorators import method_decorator
from django.utils.html import strip_tags
from django.views import View
from django.db.models import Q, Count, Max, Avg
from django.views.decorators.csrf import csrf_exempt
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny

from Dissertation import settings
from ThreatDetection.models import CustomUser, ActivityLogs, Alerts, PasswordResetToken
from src.dashboard.forms import DateRangeForm
from django.utils.timezone import now, timedelta
import json
from src.mlengine.utils import my_get_object_or_404
from src.users.form import RegistrationForm
from src.users.notifications import notify_user_account_action
from src.users.utils import suggest_usernames, _validate_email, RESET_TOKEN_BYTES, RESET_TOKEN_TTL_HOURS, parse_bool
from src.users.tasks import delete_if_unfinished_signup
from rest_framework.response import Response
from django.utils import timezone





from django.views import View
from django.http import JsonResponse
from django.core.paginator import Paginator
from django.db.models import Q, Count, Max, Subquery, OuterRef, IntegerField, DateTimeField, Value
from django.db.models.functions import Coalesce
from ThreatDetection.models import Alerts

from django.views import View
from django.http import JsonResponse
from django.core.paginator import Paginator
from django.db.models import (
    Q, Count, Max, Subquery, OuterRef, IntegerField, DateTimeField, F, Value
)
from django.db.models.functions import Coalesce

from ThreatDetection.models import Alerts

class CustomUserView(View):
    def get(self, request):
        search         = (request.GET.get('search') or '').strip()
        sort           = request.GET.get('sort', 'a-z')             # a-z | z-a | most-threats | recent-threat
        show_suspended = (request.GET.get('suspended', 'false') == 'true')
        page_number    = int(request.GET.get('page', 1))
        page_size      = int(request.GET.get('limit', 5))

        # ---- Base: only ACTIVE users (optionally exclude soft-deleted) ----
        users_qs = CustomUser.objects.filter(is_active=True)
        if hasattr(CustomUser, "deleted_at"):
            users_qs = users_qs.filter(deleted_at__isnull=True)

        # Suspended toggle
        users_qs = users_qs.filter(is_suspended=True) if show_suspended else users_qs.filter(is_suspended=False)

        # Search
        if search:
            users_qs = users_qs.filter(
                Q(username__icontains=search) |
                Q(department__icontains=search) |
                Q(role__icontains=search) |
                Q(email__icontains=search)
            )

        # ---------- Threat metrics from Alerts ----------
        # Primary path (FK): Alerts(log__user = CustomUser.pk)
        alerts_for_user = Alerts.objects.filter(log__user=OuterRef('pk'))

        threat_count_sq = alerts_for_user.values('log__user') \
                                         .annotate(c=Count('id')) \
                                         .values('c')[:1]
        last_threat_sq  = alerts_for_user.values('log__user') \
                                         .annotate(m=Max('created_at')) \
                                         .values('m')[:1]

        users_qs = users_qs.annotate(
            threat_count_sql=Subquery(threat_count_sq, output_field=IntegerField()),
            last_threat_sql =Subquery(last_threat_sq,  output_field=DateTimeField()),
        ).annotate(
            threat_count     = Coalesce(F('threat_count_sql'), Value(0)),  # <- expression, not string
            last_threat_time = F('last_threat_sql'),                       # <- expression, not string
        )

        # Sorting
        if sort == 'z-a':
            users_qs = users_qs.order_by('-username')
        elif sort == 'most-threats':
            users_qs = users_qs.order_by('-threat_count', 'username')
        elif sort == 'recent-threat':
            users_qs = users_qs.order_by('-last_threat_time', '-id')
        else:  # 'a-z'
            users_qs = users_qs.order_by('username')

        # Pagination
        paginator = Paginator(users_qs, page_size)
        page = paginator.get_page(page_number)
        page_users = list(page.object_list)

        # ---------- Fallback (CharField usernames) ----------
        # If ActivityLogs.user is a string, the subqueries above will be NULL.
        # Overlay with username-keyed aggregates so counts/time are still correct.
        username_agg = Alerts.objects.values('log__user').annotate(
            total=Count('id'),
            last =Max('created_at'),
        )
        by_username_total = {r['log__user']: r['total'] for r in username_agg if isinstance(r['log__user'], str)}
        by_username_last  = {r['log__user']: r['last']  for r in username_agg if isinstance(r['log__user'], str)}

        # Serialize
        users_payload = []
        for u in page_users:
            th = getattr(u, 'threat_count', 0) or 0
            lt = getattr(u, 'last_threat_time', None)

            # If FK annotations are empty but we have username aggregates, overlay.
            if (th == 0 or th is None) and u.username in by_username_total:
                th = by_username_total[u.username]
            if lt is None and u.username in by_username_last:
                lt = by_username_last[u.username]

            created_src = getattr(u, 'date_joined', None) or getattr(u, 'created_at', None)
            users_payload.append({
                'id': u.id,
                'username': u.username,
                'email': getattr(u, 'email', None),
                'department': getattr(u, 'department', None),
                'role': getattr(u, 'role', None),
                'is_suspended': bool(getattr(u, 'is_suspended', False)),
                'created_at': created_src.strftime('%Y-%m-%d %H:%M:%S') if created_src else '',
                'threat_count': int(th or 0),
                'last_threat_time': lt.strftime('%Y-%m-%d %H:%M:%S') if lt else '',
            })

        return JsonResponse({
            'users': users_payload,
            'current_page': page.number,
            'total_pages': paginator.num_pages,
            'total_users': paginator.count
        })




_NAME_RE = re.compile(r"^[A-Za-z ]+$")

def is_valid_person_name(s: str) -> bool:
    s = (s or "").strip()
    return bool(s) and bool(_NAME_RE.fullmatch(s))

def normalize_title_whitespace(s: str) -> str:

    s = (s or "").strip()
    if not s:
        return s
    # Replace tabs/newlines with spaces, then collapse multiple spaces
    s = re.sub(r"\s+", " ", s.replace("\t", " ").replace("\n", " "))
    return " ".join(w.capitalize() for w in s.split(" "))

def _abs_pic_url(request, obj):
    try:
        f = getattr(obj, 'profile_picture', None)
        return request.build_absolute_uri(f.url) if f else None
    except Exception:
        return None

@method_decorator(csrf_exempt, name='dispatch')
class RegistrationView(View):
    def get(self, request, *args, **kwargs):
        return JsonResponse({'error': 'Only POST allowed'}, status=405)

    def post(self, request, *args, **kwargs):
        try:
            # Because the frontend sends FormData (multipart/form-data),
            # use request.POST and request.FILES (NOT json.loads(request.body))
            data = request.POST
            files = request.FILES



            username = normalize_title_whitespace(data.get('username'))
            if not username:
                return JsonResponse({'error': 'Username is required.'}, status=400)

            # ✅ Username already taken? Suggest alternatives
            if CustomUser.objects.filter(username__iexact=username).exists():
                return JsonResponse({
                    'error': 'Username already exists. Please choose another.',
                    'suggestions': suggest_usernames(username, n=5)
                }, status=400)

            first_name = data.get('first_name', '')
            last_name = data.get('last_name', '')

            if first_name:
                if not is_valid_person_name(first_name):
                    return JsonResponse({'error': 'First name may only contain letters and spaces.'}, status=400)
                data['first_name'] = normalize_title_whitespace(first_name)

            if last_name:
                if not is_valid_person_name(last_name):
                    return JsonResponse({'error': 'Last name may only contain letters and spaces.'}, status=400)
                data['last_name'] = normalize_title_whitespace(last_name)

            # Validate/sanitize via form; be sure your form includes all fields you need
            form = RegistrationForm(data, files=files)
            if not form.is_valid():
                errors = {field: errs[0] for field, errs in form.errors.items()}

                desired = (data.get('username') or '').strip()
                # Make the banner message show the most relevant single error instead of "Validation error"
                top_msg = next(iter(errors.values()), 'Validation error')

                payload = {
                    'error': top_msg,
                    'errors': errors,
                }

                if 'username' in errors:
                    payload['suggestions'] = suggest_usernames(desired, n=5)

                return JsonResponse(payload, status=400)

            # Create user inactive (password set after email activation)
            user = form.save(commit=False)
            user.is_active = False
            user.set_unusable_password()
            user.save()

            timeout = settings.SIGNUP_ACTIVATION_TIMEOUT_SECONDS
            delete_if_unfinished_signup.apply_async(args=[user.id], countdown=timeout)


            # Build activation link (frontend will handle password set)
            frontend_origin = os.getenv('FRONTEND_ORIGIN', 'http://localhost:3000')
            token = default_token_generator.make_token(user)
            uid = user.pk
            # activation_url = f"{frontend_origin}/activate/{uid}/{token}/"
            activation_url = f"{frontend_origin}/password-setup/activate/{uid}/{token}"

            # Pretty HTML email + plain text fallback
            subject = "Confirm your registration"
            plain = (
                "Hi!\n\n"
                "Please click this link to activate your account and set your password:\n"
                f"{activation_url}\n\n"
                "If you didn’t request this, you can ignore this email."
            )
            html = f"""
                <div style="font-family: Arial, sans-serif; color: #222;">
                    <h2>Welcome to Insider Threat Detection!</h2>
                    <p>Thank you for registering.</p>
                    <p><b>To activate your account and set your password, click the button below:</b></p>
                    <p style="text-align: center; margin: 30px 0;">
                        <a href="{activation_url}" style="
                            display: inline-block;
                            background: #2563eb;
                            color: #fff;
                            text-decoration: none;
                            padding: 14px 28px;
                            border-radius: 8px;
                            font-size: 18px;
                            font-weight: bold;
                            box-shadow: 0 2px 8px #0002;
                        ">
                            Activate My Account
                        </a>
                    </p>
                    <p style="font-size: 13px; color: #888;">
                        If the button doesn’t work, copy and paste this link in your browser:<br>
                        <a href="{activation_url}" style="color: #2563eb;">{activation_url}</a>
                    </p>
                    <hr style="border:none; border-top:1px solid #eee; margin:24px 0;" />
                    <p style="font-size:12px; color:#bbb;">
                        If you didn’t request this, you can ignore this email.
                    </p>
                </div>
            """

            send_mail(
                subject,
                plain,  # fallback plain text
                getattr(settings, 'DEFAULT_FROM_EMAIL', 'no-reply@example.com'),
                [user.email],
                fail_silently=False,
                html_message=html,
            )

            return JsonResponse({
                'success': True,
                'message': 'Please check your email to activate your account.'
            })

        except Exception as e:
            # Always return JSON on error
            print("❌ Registration error:", str(e))
            return JsonResponse({'error': str(e)}, status=400)


from django.contrib.auth import get_user_model


@method_decorator(csrf_exempt, name='dispatch')
class ActivateAccountView(View):
    def post(self, request, uid, token, *args, **kwargs):
        # Frontend should send password in POST request
        try:
            data = json.loads(request.body)
            password = data.get('password')
            User = get_user_model()
            user = User.objects.get(pk=uid)
            if default_token_generator.check_token(user, token):
                user.set_password(password)
                user.is_active = True
                user.save()
                return JsonResponse({'success': True, 'message': 'Account activated!'})
            else:
                return JsonResponse({'error': 'Invalid or expired activation link.'}, status=400)
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=400)



# ONLY replace the UserDetailView with this version
class UserDetailView(View):
    def get(self, request, user_id):
        try:
            form = DateRangeForm(request.GET)
            if not form.is_valid():
                return JsonResponse({'error': form.errors}, status=400)

            start_date = form.cleaned_data.get('start_date')
            end_date = form.cleaned_data.get('end_date')

            if not start_date and not end_date:
                end_date = now().date()
                start_date = end_date - timedelta(days=1)
            elif start_date and not end_date:
                end_date = now().date()
            elif end_date and not start_date:
                start_date = end_date - timedelta(days=1)

            date_range_days = (end_date - start_date).days
            if date_range_days <= 1:
                group_by = 'hour'
            elif date_range_days <= 7:
                group_by = 'day'
            elif date_range_days <= 90:
                group_by = 'week'
            else:
                group_by = 'month'

            # activities limit
            try:
                limit = int(request.GET.get('limit', '100'))
                limit = max(1, min(limit, 500))
            except ValueError:
                limit = 100

            user = CustomUser.objects.annotate(
                threat_count=Count('activitylogs', filter=Q(activitylogs__is_suspicious=True)),
                last_threat_time=Max('activitylogs__timestamp', filter=Q(activitylogs__is_suspicious=True))
            ).get(id=user_id)

            # include first/last/is_active + absolute avatar URL
            user_data = {
                'id': user.id,
                'username': user.username,
                'first_name': user.first_name or '',
                'last_name': user.last_name or '',
                'is_active': bool(user.is_active),
                'department': user.department,
                'role': user.role,
                'email': user.email,
                'is_suspended': bool(user.is_suspended),
                'created_at': user.created_at.strftime('%Y-%m-%d %H:%M:%S') if user.created_at else '',
                'threat_count': user.threat_count,
                'last_threat_time': user.last_threat_time.strftime('%Y-%m-%d %H:%M:%S') if user.last_threat_time else '',
                'failed_login_timestamp': user.failed_login_timestamp.strftime('%Y-%m-%d %H:%M:%S') if user.failed_login_timestamp else '',
                'profile_picture_url': _abs_pic_url(request, user),   # <<— added
            }

            # alerts line points
            alerts_qs = (
                Alerts.objects
                .filter(log__user_id=user_id, log__timestamp__date__range=(start_date, end_date))
                .select_related('log')
                .order_by('log__timestamp')
            )
            alert_points = [
                {
                    'timestamp': alert.log.timestamp.strftime('%Y-%m-%d %H:%M'),
                    'score': round(alert.score, 2),
                    'user': user.username,
                    'reason': alert.log.activity_type or 'No reason'
                }
                for alert in alerts_qs
            ]

            # pie
            pie_qs = (
                ActivityLogs.objects
                .filter(user_id=user_id, is_suspicious=True, timestamp__date__range=(start_date, end_date))
                .values('activity_type')
                .annotate(count=Count('id'))
                .order_by('-count')[:5]
            )
            pie_labels = [entry['activity_type'] for entry in pie_qs]
            pie_counts  = [entry['count'] for entry in pie_qs]

            # bar
            bar_qs = (
                Alerts.objects
                .filter(log__user_id=user_id, log__timestamp__date__range=(start_date, end_date))
                .values('log__user__username')
                .annotate(avg_score=Avg('score'), activity_count=Count('id'))
            )
            bar_labels = [entry['log__user__username'] or 'Unknown' for entry in bar_qs]
            bar_scores = [round(entry['avg_score'], 2) for entry in bar_qs]
            bar_counts = [entry['activity_count'] for entry in bar_qs]

            # recent activities
            activities_qs = (
                ActivityLogs.objects
                .filter(user_id=user_id, timestamp__date__range=(start_date, end_date))
                .order_by('-timestamp')[:limit]
            )
            activities = [{
                'id': a.id,
                'timestamp': a.timestamp.strftime('%Y-%m-%d %H:%M:%S'),
                'activity_type': getattr(a, 'activity_type', '') or '',
                'details': getattr(a, 'details', '') or getattr(a, 'description', '') or '',
                'ip_address': getattr(a, 'ip_address', '') or '',
                'is_suspicious': bool(getattr(a, 'is_suspicious', False)),
            } for a in activities_qs]

            return JsonResponse({
                'user': user_data,
                'alertPoints': alert_points,
                'pieLabels': pie_labels,
                'pieData': pie_counts,
                'barLabels': bar_labels,
                'barScores': bar_scores,
                'barCounts': bar_counts,
                'activities': activities,
                'startDateUsed': str(start_date),
                'endDateUsed': str(end_date),
                'groupBy': group_by,
            })

        except CustomUser.DoesNotExist:
            return JsonResponse({'error': 'User not found'}, status=404)
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=500)



# views.py
import json
import logging
from django.db import transaction
from django.http import JsonResponse
from django.utils.decorators import method_decorator
from django.views import View
from django.views.decorators.csrf import csrf_exempt

# from core.notifications import notify_user_account_action
# from .models import CustomUser
# from .utils import my_get_object_or_404
# from .utils_bool import parse_bool

# logger = logging.getLogger(__name__)

@method_decorator(csrf_exempt, name='dispatch')
class SuspendUserView(View):
    def put(self, request, user_id):
        try:
            user = my_get_object_or_404(CustomUser, id=user_id)
            data = json.loads(request.body or "{}")

            new_state = parse_bool(data.get("is_suspended", False))
            reason = data.get("reason")

            was_suspended = bool(user.is_suspended)
            user.is_suspended = new_state
            user.save(update_fields=["is_suspended"])

            actor_email = request.user.email if getattr(request, "user", None) and request.user.is_authenticated else None
            action = "suspended" if new_state else "unsuspended"

            # Send synchronously so you can SEE failures immediately
            sent = notify_user_account_action(
                email=user.email,
                full_name=f"{(user.first_name or '')} {(user.last_name or '')}".strip(),
                action=action,
                reason=reason,
                actor_email=actor_email,
            )

            return JsonResponse({
                "success": True,
                "is_suspended": user.is_suspended,
                "email_sent": sent,
                "was_suspended": was_suspended,
            })
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=400)


@method_decorator(csrf_exempt, name='dispatch')
class DeleteUserView(View):
    def delete(self, request, user_id):
        try:
            user = my_get_object_or_404(CustomUser, id=user_id)
            data = json.loads(request.body or "{}")
            reason = data.get("reason")

            email = user.email
            full_name = f"{(user.first_name or '')} {(user.last_name or '')}".strip()
            actor_email = request.user.email if getattr(request, "user", None) and request.user.is_authenticated else None

            # Send BEFORE delete while we still have fields
            sent = notify_user_account_action(
                email=email,
                full_name=full_name,
                action="deleted",
                reason=reason,
                actor_email=actor_email,
            )

            user.delete()
            return JsonResponse({"success": True, "deleted_user_id": user_id, "email_sent": sent})
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=400)




# views.py
import re, secrets
from datetime import timedelta
from django.conf import settings
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework import status


from django.contrib.auth import get_user_model
CustomUser = get_user_model()

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
RESET_TOKEN_BYTES = 48
RESET_TOKEN_TTL_HOURS = 1

def _validate_email(e: str) -> bool:
    return bool(e and EMAIL_RE.match(e))

@csrf_exempt
@api_view(['POST'])
def forgot_password(request):
    email = (request.data.get('email') or '').strip()
    if not _validate_email(email):
        return Response({'error': 'Enter a valid email address.'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        user = CustomUser.objects.get(email__iexact=email)
    except CustomUser.DoesNotExist:
        return Response({'error': 'Email does not exist.'}, status=status.HTTP_404_NOT_FOUND)

    # Invalidate previous active tokens
    PasswordResetToken.objects.filter(
        user=user, used=False, expires_at__gt=timezone.now()
    ).update(used=True)

    # Create fresh token
    raw_token = secrets.token_urlsafe(RESET_TOKEN_BYTES)
    expires_at = timezone.now() + timedelta(hours=RESET_TOKEN_TTL_HOURS)
    PasswordResetToken.objects.create(user=user, token=raw_token, expires_at=expires_at)

    # Build reset URL for your front-end
    frontend_base = getattr(settings, 'FRONTEND_URL', 'http://localhost:3000')
    # reset_url = f"{frontend_base}/reset-password/{raw_token}"
    reset_url = f"{frontend_base}/password-setup/reset/{raw_token}"

    # -------- HTML email using template ----------
    ctx = {
        "app_name": getattr(settings, "APP_NAME", "Insider Threat Detection"),
        "reset_url": reset_url,
        "valid_hours": RESET_TOKEN_TTL_HOURS,
        "support_email": getattr(settings, "SUPPORT_EMAIL", settings.DEFAULT_FROM_EMAIL),
        "year": timezone.now().year,
        # optional extras used by the template (safe to omit if not referenced)
        "brand_color": getattr(settings, "BRAND_COLOR", "#2563EB"),
        "logo_url": getattr(settings, "EMAIL_LOGO_URL", None),
    }

    html_body = render_to_string("emails/password_reset_email.html", ctx)
    # If you also create emails/password_reset_email.txt it will be used; else strip HTML
    try:
        text_body = render_to_string("emails/password_reset_email.txt", ctx).strip()
    except Exception:
        text_body = ""
    if not text_body:
        text_body = strip_tags(html_body)

    msg = EmailMultiAlternatives(
        subject="Reset your password",
        body=text_body,
        from_email=settings.DEFAULT_FROM_EMAIL,
        to=[email],
        reply_to=[ctx["support_email"]],
        headers={"X-Entity-Ref-ID": "pwd-reset"},
    )
    msg.attach_alternative(html_body, "text/html")
    msg.send(fail_silently=False)
    # --------------------------------------------

    return Response({'message': 'Password reset link sent to your email.'}, status=status.HTTP_200_OK)

@api_view(['POST'])
@csrf_exempt
@permission_classes([AllowAny])
def password_reset_confirm(request):
    token = (request.data.get('token') or '').strip()
    password = (request.data.get('password') or '').strip()

    if not token:
        return Response({'error': 'Missing token.'}, status=400)
    if len(password) < 8:
        return Response({'error': 'Password must be at least 8 characters.'}, status=400)

    try:
        rec = PasswordResetToken.objects.select_related('user').get(token=token)
    except PasswordResetToken.DoesNotExist:
        return Response({'error': 'Invalid reset token.'}, status=400)

    if rec.used:
        return Response({'error': 'This reset link has already been used.'}, status=400)
    if rec.is_expired():
        return Response({'error': 'This reset link has expired.'}, status=400)

    user = rec.user
    user.set_password(password)
    user.save()

    rec.used = True
    rec.save(update_fields=['used'])

    return Response({'success': True, 'message': 'Password has been reset successfully.'}, status=200)



## src/users/views.py  (excerpt for the edit endpoint)

from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt  # not needed once we use APIView w/ JWT
from django.db import transaction

from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status

from ThreatDetection.models import CustomUser
from src.mlengine.utils import my_get_object_or_404
from src.users.utils import suggest_usernames, _validate_email, parse_bool

def compose_absolute_media_url_for_frontend_rendering_superlength_identifier_v1(request, file_field_obj):
    if not file_field_obj:
        return None
    try:
        return request.build_absolute_uri(file_field_obj.url)
    except Exception:
        return getattr(file_field_obj, "url", None)

def serialize_user_payload_for_editor_response_ultra_descriptive_v20250814(request, user_obj: CustomUser):
    return {
        "id": user_obj.id,
        "username": user_obj.username,
        "email": user_obj.email or "",
        "first_name": user_obj.first_name or "",
        "last_name": user_obj.last_name or "",
        "address": user_obj.address or "",
        "department": user_obj.department or "",
        "role": user_obj.role or "",
        "is_active": bool(user_obj.is_active),
        "is_suspended": bool(user_obj.is_suspended),
        "created_at": user_obj.created_at.strftime("%Y-%m-%d %H:%M:%S") if user_obj.created_at else "",
        "failed_login_timestamp": user_obj.failed_login_timestamp.strftime("%Y-%m-%d %H:%M:%S") if user_obj.failed_login_timestamp else "",
        "profile_picture": getattr(getattr(user_obj, "profile_picture", None), "name", None),
        "profile_picture_url": compose_absolute_media_url_for_frontend_rendering_superlength_identifier_v1(
            request, getattr(user_obj, "profile_picture", None)
        ),
    }

class AdministrativeUserProfileEditView(APIView):
    """
    GET  /api/users/<id>/edit/   -> returns editable payload
    PATCH/PUT/POST               -> updates fields (multipart or JSON)
    """
    # permission_classes = [IsAuthenticated]
    # If you want to pin auth instead of using REST_FRAMEWORK defaults:
    # from rest_framework_simplejwt.authentication import JWTAuthentication
    # authentication_classes = [JWTAuthentication]

    def get(self, request, user_id):

        try:

            u = my_get_object_or_404(CustomUser, id=user_id)

            # Admins can read anyone; non-admins can only read themselves
            # if not (getattr(request.user, "is_staff", False) or request.user.id == u.id):
            #     return Response({"error": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)

            payload = serialize_user_payload_for_editor_response_ultra_descriptive_v20250814(request, u)
            return Response({"user": payload})
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @transaction.atomic
    def post(self, request, user_id):
        try:
            u = my_get_object_or_404(CustomUser, id=user_id)

            # if not getattr(request.user, "is_staff", False):
            #     return Response({"error": "Only admins can edit users."}, status=status.HTTP_403_FORBIDDEN)

            is_multipart = request.content_type and request.content_type.startswith("multipart/")
            if is_multipart:
                data, files = request.POST, request.FILES
            else:
                try:
                    data = request.data or {}
                except Exception:
                    data = {}
                files = {}

            username = (data.get("username") or "").strip() or None
            email    = (data.get("email") or "").strip() or None
            first    = (data.get("first_name") or "").strip()
            last     = (data.get("last_name") or "").strip()
            address  = (data.get("address") or "").strip()
            dept     = (data.get("department") or "").strip()
            role     = (data.get("role") or "").strip()

            is_active    = data.get("is_active", None)
            is_suspended = data.get("is_suspended", None)

            remove_pic = parse_bool(data.get("remove_profile_picture", False))
            new_pic    = files.get("profile_picture")

            # --- validation ---
            errs = {}
            desired_username = normalize_title_whitespace(data.get("username"))
            if desired_username and desired_username.lower() != (u.username or "").lower():
                if CustomUser.objects.filter(username__iexact=desired_username).exclude(id=u.id).exists():
                    return Response({
                        "error": "Username already exists.",
                        "errors": {"username": "Username already exists.",
                                   "suggestions": suggest_usernames(desired_username, n=5)}
                    }, status=status.HTTP_400_BAD_REQUEST)
                first = data.get("first_name", "")
                last = data.get("last_name", "")

            # if email is not None and email != (u.email or ""):
            #     if not _validate_email(email):
            #         errs["email"] = "Enter a valid email address."
            #     elif CustomUser.objects.filter(email__iexact=email).exclude(id=u.id).exists():
            #         errs["email"] = "Email already in use."

            if first != "":
                if not is_valid_person_name(first):
                    return Response({"error": "First name may only contain letters and spaces."},
                                    status=status.HTTP_400_BAD_REQUEST)
                first = normalize_title_whitespace(first)

            if last != "":
                if not is_valid_person_name(last):
                    return Response({"error": "Last name may only contain letters and spaces."},
                                    status=status.HTTP_400_BAD_REQUEST)
                last = normalize_title_whitespace(last)

            if errs:
                return Response({"error": next(iter(errs.values())), "errors": errs}, status=status.HTTP_400_BAD_REQUEST)

            # --- persist ---
            if username is not None: u.username = username
            if email is not None:    u.email = email
            address = (data.get("address") or "").strip()
            dept = (data.get("department") or "").strip()
            role = (data.get("role") or "").strip()

            is_active = data.get("is_active", None)
            is_suspended = data.get("is_suspended", None)

            remove_pic = parse_bool(data.get("remove_profile_picture", False))
            new_pic = files.get("profile_picture")
            if desired_username is not None and desired_username != "":
                u.username = desired_username

            if remove_pic:
                if getattr(u, "profile_picture", None):
                    u.profile_picture.delete(save=False)
                u.profile_picture = None
            elif new_pic:
                u.profile_picture = new_pic

            u.save()
            payload = serialize_user_payload_for_editor_response_ultra_descriptive_v20250814(request, u)
            return Response({"success": True, "user": payload})
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)



    # Alias PUT/PATCH to POST
    def put(self, request, user_id):   return self.post(request, user_id)
    def patch(self, request, user_id): return self.post(request, user_id)
