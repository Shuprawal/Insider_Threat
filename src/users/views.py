import os
import secrets

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
from src.users.utils import suggest_usernames, _validate_email, RESET_TOKEN_BYTES, RESET_TOKEN_TTL_HOURS
from src.users.tasks import delete_if_unfinished_signup
from rest_framework.response import Response
from django.utils import timezone


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

            username = (data.get('username') or '').strip()
            if not username:
                return JsonResponse({'error': 'Username is required.'}, status=400)

            # ✅ Username already taken? Suggest alternatives
            if CustomUser.objects.filter(username__iexact=username).exists():
                return JsonResponse({
                    'error': 'Username already exists. Please choose another.',
                    'suggestions': suggest_usernames(username, n=5)
                }, status=400)

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





class CustomUserView(View):
    def get(self, request):
        search = request.GET.get('search', '')
        sort = request.GET.get('sort', '')
        show_suspended = request.GET.get('suspended', 'false') == 'true'
        page_number = int(request.GET.get('page', 1))
        page_size = int(request.GET.get('limit', 5))

        if show_suspended:
            users = CustomUser.objects.filter(is_suspended=True)
        else:
            users = CustomUser.objects.filter(is_suspended=False)


        if search:
            users = users.filter(
                Q(username__icontains=search) |
                Q(department__icontains=search) |
                Q(role__icontains=search)
            )

        # ✅ Add annotations for threat metrics
        users = users.annotate(
            threat_count=Count('activitylogs', filter=Q(activitylogs__is_suspicious=True)),
            last_threat_time=Max('activitylogs__timestamp', filter=Q(activitylogs__is_suspicious=True))
        )

        # ✅ Apply sorting
        if sort == 'a-z':
            users = users.order_by('username')
        elif sort == 'z-a':
            users = users.order_by('-username')
        elif sort == 'most-threats':
            users = users.order_by('-threat_count')
        elif sort == 'recent-threat':
            users = users.order_by('-last_threat_time')

        # ✅ Pagination
        paginator = Paginator(users, page_size)
        page = paginator.get_page(page_number)

        # ✅ Format user list
        user_list = [{
            'id': user.id,
            'username': user.username,
            'email': user.email,
            'department': user.department,
            'role': user.role,
            'is_suspended': user.is_suspended,
            'created_at': user.created_at.strftime('%Y-%m-%d %H:%M:%S'),
            'threat_count': user.threat_count,
            'last_threat_time': user.last_threat_time.strftime('%Y-%m-%d %H:%M:%S') if user.last_threat_time else ''
        } for user in page.object_list]

        return JsonResponse({
            'users': user_list,
            'current_page': page_number,
            'total_pages': paginator.num_pages,
            'total_users': paginator.count
        })


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

            # Optional simple pagination for activities
            try:
                limit = int(request.GET.get('limit', '100'))
                limit = max(1, min(limit, 500))  # clamp 1..500
            except ValueError:
                limit = 100

            user = CustomUser.objects.annotate(
                threat_count=Count('activitylogs', filter=Q(activitylogs__is_suspicious=True)),
                last_threat_time=Max('activitylogs__timestamp', filter=Q(activitylogs__is_suspicious=True))
            ).get(id=user_id)

            user_data = {
                'id': user.id,
                'username': user.username,
                'department': user.department,
                'role': user.role,
                'email': user.email,
                'is_suspended': user.is_suspended,
                'created_at': user.created_at.strftime('%Y-%m-%d %H:%M:%S'),
                'threat_count': user.threat_count,
                'last_threat_time': user.last_threat_time.strftime('%Y-%m-%d %H:%M:%S') if user.last_threat_time else '',
                'failed_login_timestamp': user.failed_login_timestamp.strftime('%Y-%m-%d %H:%M:%S') if user.failed_login_timestamp else ''
            }

            # Line chart (alerts)
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

            # Pie (activity types among suspicious)
            pie_qs = (
                ActivityLogs.objects
                .filter(user_id=user_id, is_suspicious=True, timestamp__date__range=(start_date, end_date))
                .values('activity_type')
                .annotate(count=Count('id'))
                .order_by('-count')[:5]
            )
            pie_labels = [entry['activity_type'] for entry in pie_qs]
            pie_counts = [entry['count'] for entry in pie_qs]

            # Bar (this user only)
            bar_qs = (
                Alerts.objects
                .filter(log__user_id=user_id, log__timestamp__date__range=(start_date, end_date))
                .values('log__user__username')
                .annotate(avg_score=Avg('score'), activity_count=Count('id'))
            )
            bar_labels = [entry['log__user__username'] or 'Unknown' for entry in bar_qs]
            bar_scores = [round(entry['avg_score'], 2) for entry in bar_qs]
            bar_counts = [entry['activity_count'] for entry in bar_qs]

            # NEW: recent activities list (newest first)
            activities_qs = (
                ActivityLogs.objects
                .filter(user_id=user_id, timestamp__date__range=(start_date, end_date))
                .order_by('-timestamp')[:limit]
            )
            activities = []
            for a in activities_qs:
                activities.append({
                    'id': a.id,
                    'timestamp': a.timestamp.strftime('%Y-%m-%d %H:%M:%S'),
                    'activity_type': getattr(a, 'activity_type', '') or '',
                    'details': getattr(a, 'details', '') or getattr(a, 'description', '') or '',
                    'ip_address': getattr(a, 'ip_address', '') or '',
                    'is_suspicious': bool(getattr(a, 'is_suspicious', False)),
                })

            return JsonResponse({
                'user': user_data,
                'alertPoints': alert_points,
                'pieLabels': pie_labels,
                'pieData': pie_counts,
                'barLabels': bar_labels,
                'barScores': bar_scores,
                'barCounts': bar_counts,
                'activities': activities,  # NEW
                'startDateUsed': str(start_date),
                'endDateUsed': str(end_date),
                'groupBy': group_by,
            })

        except CustomUser.DoesNotExist:
            return JsonResponse({'error': 'User not found'}, status=404)
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=500)


@method_decorator(csrf_exempt, name='dispatch')
class SuspendUserView(View):
    def put(self, request, user_id):
        try:
            user = my_get_object_or_404(CustomUser, id=user_id)
            data = json.loads(request.body)
            user.is_suspended = data.get("is_suspended", False)
            user.save()
            return JsonResponse({'success': True})
        except Exception as e:
            return JsonResponse({'error': str(e)}, status=400)

@method_decorator(csrf_exempt, name='dispatch')
class DeleteUserView(View):

    def delete(self, request, user_id):
        user = my_get_object_or_404(CustomUser, id=user_id)
        user.delete()
        return redirect('user-detail', user_id=user_id)


#
#
# @csrf_exempt
# @api_view(['POST'])
# def forgot_password(request):
#
#     email = (request.data.get('email') or '').strip()
#     if not _validate_email(email):
#         return Response({'error': 'Enter a valid email address.'}, status=status.HTTP_400_BAD_REQUEST)
#
#     try:
#         user = CustomUser.objects.get(email__iexact=email)
#     except CustomUser.DoesNotExist:
#         return Response({'error': 'Email does not exist.'}, status=status.HTTP_404_NOT_FOUND)
#
#     # Invalidate any previous active tokens (optional but recommended)
#     PasswordResetToken.objects.filter(user=user, used=False, expires_at__gt=timezone.now()).update(used=True)
#
#     # Create fresh token
#     raw_token = secrets.token_urlsafe(RESET_TOKEN_BYTES)
#     expires_at = timezone.now() + timedelta(hours=RESET_TOKEN_TTL_HOURS)
#     PasswordResetToken.objects.create(user=user, token=raw_token, expires_at=expires_at)
#
#     # Build frontend link like: https://frontend/reset-password/<token>
#     frontend_base = getattr(settings, 'FRONTEND_URL', 'http://localhost:5173')
#     reset_url = f"{frontend_base}/reset-password/{raw_token}"
#
#     # Send the email (custom message; no Django built-in reset helpers)
#     send_mail(
#         subject="Password reset instructions",
#         message=(
#             "You requested a password reset.\n\n"
#             f"Use this link to set a new password (valid {RESET_TOKEN_TTL_HOURS} hour(s)):\n{reset_url}\n\n"
#             "If you didn’t request this, please ignore this email."
#         ),
#         from_email=settings.DEFAULT_FROM_EMAIL,
#         recipient_list=[email],
#         fail_silently=False,
#     )
#
#     return Response({'message': 'Password reset link sent to your email.'}, status=status.HTTP_200_OK)
#
#
# @csrf_exempt
# @api_view(['POST'])
# @permission_classes([AllowAny])
# def password_reset_confirm(request):
#     """
#     Body: { "token": "<token-from-email>", "password": "NewStrong#123" }
#     - Verifies token exists, not used, not expired
#     - Sets new password
#     - Marks token as used
#     """
#     token = (request.data.get('token') or '').strip()
#     password = (request.data.get('password') or '').strip()
#
#     if not token:
#         return Response({'error': 'Missing token.'}, status=status.HTTP_400_BAD_REQUEST)
#     if len(password) < 8:
#         return Response({'error': 'Password must be at least 8 characters.'}, status=status.HTTP_400_BAD_REQUEST)
#
#     try:
#         rec = PasswordResetToken.objects.select_related('user').get(token=token)
#     except PasswordResetToken.DoesNotExist:
#         return Response({'error': 'Invalid reset token.'}, status=status.HTTP_400_BAD_REQUEST)
#
#     if rec.used:
#         return Response({'error': 'This reset link has already been used.'}, status=status.HTTP_400_BAD_REQUEST)
#     if rec.is_expired():
#         return Response({'error': 'This reset link has expired.'}, status=status.HTTP_400_BAD_REQUEST)
#
#     # Update the user's password (use Django hasher)
#     user = rec.user
#     user.set_password(password)
#     user.save()
#
#     # Mark token as used
#     rec.used = True
#     rec.save(update_fields=['used'])
#
#     return Response({'success': True, 'message': 'Password has been reset successfully.'}, status=status.HTTP_200_OK)



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
