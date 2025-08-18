# src/users/tasks.py
from celery import shared_task
from django.contrib.auth import get_user_model
from django.utils import timezone
from datetime import timedelta
from django.core.mail import send_mail
from django.conf import settings

User = get_user_model()

@shared_task
def delete_if_unfinished_signup(user_id):
    try:
        u = User.objects.get(pk=user_id)
    except User.DoesNotExist:
        return

    window = int(getattr(settings, "SIGNUP_ACTIVATION_TIMEOUT_SECONDS", 3600))
    cutoff = timezone.now() - timedelta(seconds=window)

    created = getattr(u, "created_at", None) or getattr(u, "date_joined", None)
    if created is None:
        return

    password_missing = (not u.has_usable_password()) or (not u.password)

    if created <= cutoff and password_missing and not u.is_superuser :
        try:
            send_mail(
                "Activation expired — please register again",
                "Your activation window expired, so the pending account was removed. Please register again.",
                getattr(settings, "DEFAULT_FROM_EMAIL", "no-reply@example.com"),
                [u.email],
                fail_silently=False,
            )
        finally:
            u.delete()
