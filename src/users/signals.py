# ThreatDetection/signals_admin.py
import os
from django.db.models.signals import post_migrate
from django.dispatch import receiver
from ThreatDetection.models import CustomUser  # your custom model

ADMIN_USERNAME = os.getenv("ADMIN_USERNAME", "admin").strip()
ADMIN_EMAIL    = (os.getenv("ADMIN_EMAIL", "admin@gmail.com") or "").strip().lower()
ADMIN_PASSWORD = (
    os.getenv("ADMIN_PASSWORD")
    or os.getenv("DJANGO_SUPERUSER_PASSWORD")
    or "change-me-now"
)

@receiver(post_migrate)
def ensure_admin_after_migrate(sender, using, **kwargs):


    # Only run when this app finishes migrating
    if getattr(sender, "label", None) != "threatdetection":
        return

    u_by_username = CustomUser.objects.filter(username__iexact=ADMIN_USERNAME).first()
    u_by_email    = CustomUser.objects.filter(email__iexact=ADMIN_EMAIL).first()

    # Choose which existing account becomes the admin:
    # priority to the "admin" username if both exist but are different users
    target = u_by_username or u_by_email

    if target:
        changed = []

        # role
        if (target.role or "").lower() != "admin":
            target.role = "admin"; changed.append("role")

        # superuser flag comes from PermissionsMixin
        if not getattr(target, "is_superuser", False):
            target.is_superuser = True; changed.append("is_superuser")

        # active
        if not getattr(target, "is_active", False):
            target.is_active = True; changed.append("is_active")

        # unsuspend if your model has it
        if hasattr(target, "is_suspended") and getattr(target, "is_suspended", False):
            target.is_suspended = False; changed.append("is_suspended")

        if changed:
            target.save(update_fields=changed)

        return

    # Neither username=admin nor email=admin@gmail.com exists -> create ONE user
    u = CustomUser(
        username=ADMIN_USERNAME,
        email=ADMIN_EMAIL,
        role="admin",
        is_superuser=True,
        is_active=True,
        is_suspended=False,
    )
    # Use YOUR custom hashing (no Django built-ins)
    u.set_password(ADMIN_PASSWORD)
    u.save()
