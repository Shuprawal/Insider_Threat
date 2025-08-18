# # src/alerts/signals.py

from __future__ import annotations

from django.db.models.signals import post_save
from django.dispatch import receiver
from django.db import transaction
from django.conf import settings
from django.core.mail import send_mail
from django.utils import timezone as dj_tz

from ThreatDetection.models import Alerts
from src.dashboard.broadcast import push_alert as broadcast_push_alert


HIGH_SEVERITY_CUTOFF = getattr(settings, "ALERT_HIGH_SEVERITY_CUTOFF", 60)  # banner/siren
DEACTIVATE_CUTOFF    = getattr(settings, "ALERT_DEACTIVATE_CUTOFF", 60)     # auto-suspend


def _to_pct(score) -> float:
    """Accept 0..1 or 0..100; return percent (0..100)."""
    try:
        s = float(score or 0)
        return s * 100 if s <= 1 else s
    except Exception:
        return 0.0


def _ts_iso_utc(ts):
    """Return ISO string in UTC with 'Z' suffix; default now()."""
    if ts is None:
        ts = dj_tz.now()
    if dj_tz.is_naive(ts):
        ts = dj_tz.make_aware(ts, dj_tz.get_current_timezone())
    z = ts.astimezone(dj_tz.utc)
    return z.isoformat().replace("+00:00", "Z")


@receiver(post_save, sender=Alerts)
def on_alert_created(sender, instance: Alerts, created: bool, **kwargs):
    """On new Alerts row, broadcast to WS, optionally auto-suspend, and send email notifications."""
    if not created:
        return

    def _after_commit():
        # Re-fetch with relations to avoid stale/partial objects
        try:
            alert = Alerts.objects.select_related("log", "log__user").get(pk=instance.pk)
        except Alerts.DoesNotExist:
            print("⚠️ Alerts.on_alert_created: alert vanished before commit; skipping.")
            return

        log  = getattr(alert, "log", None)
        user = getattr(log, "user", None)

        # Core fields
        username    = getattr(user, "username", "Unknown")
        user_id     = getattr(user, "id", None)
        user_email  = getattr(user, "email", None)
        score_raw   = getattr(alert, "score", None)  # may be 0..1 or 0..100
        score_pct   = _to_pct(score_raw)
        ts_iso      = _ts_iso_utc(getattr(log, "timestamp", None))
        reason      = (getattr(alert, "reason", None)
                       or getattr(log, "activity_type", None)
                       or "Suspicious activity")
        details     = (getattr(log, "details", "") or "")[:500]

        print("🚨 Alerts signal fired!")
        print(f" alert_id={alert.id} user={username} (id={user_id}) score_raw={score_raw} -> {score_pct:.2f}%")

        # Optional: auto-suspend account above cutoff
        auto_suspended = False
        try:
            if user and score_pct >= DEACTIVATE_CUTOFF and hasattr(user, "is_suspended"):
                if not bool(getattr(user, "is_suspended", False)):
                    user.is_suspended = True
                    user.save(update_fields=["is_suspended"])
                    auto_suspended = True
                    print(f"✅ '{username}' (id={user_id}) auto-suspended (score {score_pct:.2f}%).")
                else:
                    print(f"ℹ️ '{username}' (id={user_id}) already suspended.")
            else:
                if score_pct < DEACTIVATE_CUTOFF:
                    print(f"ℹ️ No suspend — score {score_pct:.2f}% < {DEACTIVATE_CUTOFF}%.")
        except Exception as e:
            print(f"⚠️ Deactivate user failed: {e}")

        # Build payload for WS (client expects these keys)
        payload = {
            "username": username,
            "userId": user_id,
            "timestamp": ts_iso,
            "score": score_pct,           # send percent for charts
            "score_pct": score_pct,
            "adjusted_probability": float(score_raw) if (score_raw is not None and _to_pct(score_raw) != score_raw) else None,
            "reason": reason,
            "details": details,
            "autoSuspended": auto_suspended,
            "severity": "high" if score_pct >= HIGH_SEVERITY_CUTOFF else "normal",
            "alert_id": getattr(alert, "id", None),
        }

        print(f"📤 signals -> push_alert: {payload}")
        try:
            # Single source of truth for broadcasting — do NOT redefine push_alert here.
            broadcast_push_alert(payload)
        except Exception as e:
            print(f"⚠️ push_alert failed from signals: {e}")

        # Email admins (best-effort, silent on failure)
        admin_recipients = [e for e in getattr(settings, "SECURITY_NOTIFICATION_EMAILS", []) if e]
        if admin_recipients:
            subject = f"[Insider Monitor] Alert for {username} (score {score_pct:.0f}%)"
            body = "\n".join([
                f"User: {username} (id={user_id})",
                f"Score: {score_pct:.0f}%",
                f"Reason: {reason or 'N/A'}",
                f"Timestamp: {ts_iso}",
                f"Alert ID: {alert.id}",
                f"Auto-suspended: {auto_suspended}",
                "",
                f"Details: {details}" if details else "Details: (none)",
            ])
            try:
                send_mail(
                    subject=subject,
                    message=body,
                    from_email=getattr(settings, "DEFAULT_FROM_EMAIL", None),
                    recipient_list=admin_recipients,
                    fail_silently=True,
                )
            except Exception as e:
                print(f"⚠️ admin email failed: {e}")

        # Email end user (warning)
        if user_email:
            try:
                subject = "Security Notice: Unusual Activity Detected"
                lines = [
                    f"Hi {username},",
                    "",
                    "Our system detected unusual activity associated with your account.",
                    f"Detection score: {score_pct:.0f}%.",
                    "",
                ]
                if auto_suspended:
                    lines += [
                        "As a precaution, your account has been temporarily deactivated.",
                        "Please contact the security team or your administrator to regain access.",
                        "",
                    ]
                else:
                    lines += [
                        "No immediate action is required, but please review your recent activity.",
                        "",
                    ]
                if reason:
                    lines += [f"Details: {reason}", ""]
                lines += [f"Time: {ts_iso}", "", "Thank you."]
                send_mail(
                    subject=subject,
                    message="\n".join(lines),
                    from_email=getattr(settings, "DEFAULT_FROM_EMAIL", None),
                    recipient_list=[user_email],
                    fail_silently=True,
                )
            except Exception as e:
                print(f"⚠️ user email failed: {e}")

    transaction.on_commit(_after_commit)
