# # src/alerts/signals.py
# from django.db.models.signals import post_save
# from django.dispatch import receiver
# from django.db import transaction
# from django.utils import timezone as dj_tz
#
# from ThreatDetection.models import Alerts  # your Alerts model
# from src.dashboard.broadcast import push_alert
#
# THRESHOLD_SUSPEND = 60  # percent for "high" severity in UI
#
# def _to_pct(score) -> float:
#     """Accepts 0..1 or 0..100; returns percent 0..100."""
#     try:
#         s = float(score or 0)
#         return s * 100 if s <= 1 else s
#     except Exception:
#         return 0.0
#
# def _ts_iso_utc(ts):
#     """Return ISO string in UTC with Z suffix."""
#     if ts is None:
#         ts = dj_tz.now()
#     if dj_tz.is_naive(ts):
#         ts = dj_tz.make_aware(ts, dj_tz.get_current_timezone())
#     z = ts.astimezone(dj_tz.utc)
#     return z.isoformat().replace("+00:00", "Z")
#
# @receiver(post_save, sender=Alerts)
# def on_threat_created(sender, instance, created, **kwargs):
#     print("🚨 Alerts signal fired!")
#     print(f"  created={created}, alert_id={getattr(instance, 'id', None)}")
#
#     if not created:
#         return
#
#     def _after_commit():
#         # Re-fetch to ensure all relations/values are available and final
#         try:
#             inst = Alerts.objects.select_related("log", "log__user").get(pk=instance.pk)
#         except Alerts.DoesNotExist:
#             print("⚠️ Could not refetch Alerts instance; aborting broadcast")
#             return
#
#         # ----- pull data from the right places -----
#         score_raw = getattr(inst, "score", None)  # <— THIS is your model's score field
#         score_pct = _to_pct(score_raw)
#
#         log = getattr(inst, "log", None)
#         user = getattr(log, "user", None)
#
#         username = getattr(user, "username", "Unknown")
#         user_id = getattr(user, "id", None)
#
#         ts_val = getattr(log, "timestamp", None)   # <— timestamp comes from ActivityLogs
#         ts_iso = _ts_iso_utc(ts_val)
#
#         # Prefer Alerts.reason; otherwise fall back to the ActivityLogs fields
#         reason_text = (
#             getattr(inst, "reason", None)
#             or getattr(log, "activity_type", None)
#             or "Suspicious activity"
#         )
#         details_text = (getattr(log, "details", "") or "")[:500]
#
#         # ----- debug prints -----
#         print(f"  user={username} (id={user_id})")
#         print(f"  score_raw={score_raw} -> score_pct={score_pct}")
#         print(f"  ts(raw)={ts_val} -> {ts_iso}")
#         print(f"  reason='{reason_text}'")
#         print(f"  details(len)={len(details_text)}")
#
#         payload = {
#             "username": username,
#             "userId": user_id,
#             "timestamp": ts_iso,
#             # include both for the frontend's flexible parsers
#             "score": score_pct,            # percent (0..100)
#             "score_pct": score_pct,        # duplicate key many UIs expect
#             # keep a 0..1 for completeness if you like (helps your UI parser too)
#             "adjusted_probability": float(score_raw) if score_raw is not None and score_raw <= 1 else None,
#             "reason": reason_text,
#             "details": details_text,
#             "autoSuspended": False,
#             "severity": "high" if score_pct >= THRESHOLD_SUSPEND else "normal",
#             "alert_id": getattr(inst, "id", None),
#         }
#
#         print(f"📤 Broadcasting payload: {payload}")
#         push_alert(payload)
#
#     transaction.on_commit(_after_commit)
#
#
# # src/alerts/signals.py
# from django.db.models.signals import post_save
# from django.dispatch import receiver
# from django.db import transaction
# from django.conf import settings
# from django.core.mail import send_mail
# from django.utils import timezone as dj_tz
#
# from ThreatDetection.models import Alerts  # your Alerts model
#
# SUSPEND_CUTOFF = 75  # percent
#
#
# @receiver(post_save, sender=Alerts)
# def on_alert_created(sender, instance, created, **kwargs):
#
#     if not created:
#         return
#
#     # Resolve user through the related log
#     user = getattr(getattr(instance, "log", None), "user", None)
#
#     # Score handling (your Alerts.score can be prob [0..1] or percent)
#     score_pct = _to_pct(getattr(instance, "score", 0))
#     reason    = (getattr(instance, "reason", "") or "").strip()
#     ts        = getattr(getattr(instance, "log", None), "timestamp", None)
#     ts_iso    = _ts_iso_utc(ts)
#
#     username  = getattr(user, "username", "Unknown")
#     user_id   = getattr(user, "id", None)
#     user_email = getattr(user, "email", None)
#
#     auto_deactivated = False
#
#     def _do_side_effects():
#         nonlocal auto_deactivated
#
#         # 1) Possibly deactivate / suspend
#         try:
#             if user and score_pct >= SUSPEND_CUTOFF:
#                 if hasattr(user, "is_active"):
#                     if user.is_active:  # only write if change needed
#                         user.is_active = False
#                         user.save(update_fields=["is_active"])
#                         auto_deactivated = True
#                 elif hasattr(user, "is_suspended"):
#                     if not getattr(user, "is_suspended", False):
#                         user.is_suspended = True
#                         user.save(update_fields=["is_suspended"])
#                         auto_deactivated = True
#         except Exception:
#             # Don't block email/broadcast if user update fails
#             pass
#
#         # 2) Email admins
#         admin_recipients = [e for e in getattr(settings, "SECURITY_NOTIFICATION_EMAILS", []) if e]
#         if admin_recipients:
#             subject = f"[Insider Monitor] Alert for {username} (score {score_pct:.0f}%)"
#             lines = [
#                 f"User:        {username} (id={user_id})",
#                 f"Score:       {score_pct:.0f}%",
#                 f"Reason:      {reason or 'N/A'}",
#                 f"Timestamp:   {ts_iso}",
#                 f"Alert ID:    {instance.id}",
#                 f"Deactivated: {auto_deactivated}",
#             ]
#             send_mail(
#                 subject=subject,
#                 message="\n".join(lines),
#                 from_email=getattr(settings, "DEFAULT_FROM_EMAIL", None),
#                 recipient_list=admin_recipients,
#                 fail_silently=True,
#             )
#
#         # 3) Email the end user (warning)
#         if user_email:
#             try:
#                 subject = "Security Notice: Unusual Activity Detected"
#                 body_lines = [
#                     f"Hi {username},",
#                     "",
#                     "Our system detected unusual activity associated with your account.",
#                     f"Detection score: {score_pct:.0f}%",
#                 ]
#                 if score_pct >= SUSPEND_CUTOFF:
#                     body_lines += [
#                         "",
#                         "As a precaution, your account has been temporarily deactivated.",
#                         "Please contact the security team or your administrator to regain access.",
#                     ]
#                 else:
#                     body_lines += [
#                         "",
#                         "No action is required from you right now, but please review your recent activity.",
#                     ]
#                 if reason:
#                     body_lines += ["", f"Details: {reason}"]
#                 body_lines += ["", f"Time: {ts_iso}", "", "Thank you."]
#
#                 send_mail(
#                     subject=subject,
#                     message="\n".join(body_lines),
#                     from_email=getattr(settings, "DEFAULT_FROM_EMAIL", None),
#                     recipient_list=[user_email],
#                     fail_silently=True,
#                 )
#             except Exception:
#                 pass
#
#     # Run after the transaction commits so we don’t email on rollbacks
#     transaction.on_commit(_do_side_effects)



# src/alerts/signals.py
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.db import transaction
from django.conf import settings
from django.core.mail import send_mail
from django.utils import timezone as dj_tz

from ThreatDetection.models import Alerts  # your Alerts model
from src.dashboard.broadcast import push_alert

HIGH_SEVERITY_CUTOFF = 60  # UI "high" threshold
DEACTIVATE_CUTOFF    = 75  # percent => deactivate user

def _to_pct(score) -> float:
    """Accept 0..1 or 0..100; return percent in 0..100 range."""
    try:
        s = float(score or 0)
        return s * 100 if s <= 1 else s
    except Exception:
        return 0.0

def _ts_iso_utc(ts):
    """Return ISO string in UTC with 'Z' suffix."""
    if ts is None:
        ts = dj_tz.now()
    if dj_tz.is_naive(ts):
        ts = dj_tz.make_aware(ts, dj_tz.get_current_timezone())
    z = ts.astimezone(dj_tz.utc)
    return z.isoformat().replace("+00:00", "Z")

@receiver(post_save, sender=Alerts)
def on_alert_created(sender, instance, created, **kwargs):
    if not created:
        return

    # Defer all side-effects until after DB commit
    def _after_commit():
        # Re-fetch with relations to avoid stale/partial objects
        try:
            alert = Alerts.objects.select_related("log", "log__user").get(pk=instance.pk)
        except Alerts.DoesNotExist:
            print("⚠️ Alerts.on_alert_created: alert vanished before commit; skip.")
            return

        log  = getattr(alert, "log", None)
        user = getattr(log, "user", None)

        # Score normalization
        score_raw = getattr(alert, "score", None)
        score_pct = _to_pct(score_raw)

        # Basic fields
        username   = getattr(user, "username", "Unknown")
        user_id    = getattr(user, "id", None)
        user_email = getattr(user, "email", None)
        ts_raw     = getattr(log, "timestamp", None)
        ts_iso     = _ts_iso_utc(ts_raw)
        reason     = (getattr(alert, "reason", None)
                      or getattr(log, "activity_type", None)
                      or "Suspicious activity")
        details    = (getattr(log, "details", "") or "")[:500]

        # Debug
        print("🚨 Alerts signal fired!")
        print(f"  alert_id={alert.id} user={username} (id={user_id})")
        print(f"  score_raw={score_raw} -> score_pct={score_pct:.2f}")
        print(f"  ts={ts_raw} -> {ts_iso}")
        print(f"  reason='{reason}' details_len={len(details)}")

        # 1) Deactivate/suspend if needed
        auto_deactivated = False
        try:
            if user and score_pct >= DEACTIVATE_CUTOFF:
                if hasattr(user, "is_active"):
                    if user.is_active:
                        user.is_active = False
                        user.save(update_fields=["is_active"])
                        auto_deactivated = True
                elif hasattr(user, "is_suspended"):
                    if not getattr(user, "is_suspended", False):
                        user.is_suspended = True
                        user.save(update_fields=["is_suspended"])
                        auto_deactivated = True
        except Exception as e:
            print(f"⚠️ Deactivate user failed: {e}")

        # 2) Broadcast to the websocket UI
        payload = {
            "username": username,
            "userId": user_id,
            "timestamp": ts_iso,
            "score": score_pct,
            "score_pct": score_pct,
            # Also include a 0..1 field if score_raw looks like a probability
            "adjusted_probability": float(score_raw) if (score_raw is not None and float(score_raw) <= 1) else None,
            "reason": reason,
            "details": details,
            "autoSuspended": auto_deactivated,
            "severity": "high" if score_pct >= HIGH_SEVERITY_CUTOFF else "normal",
            "alert_id": alert.id,
        }
        print(f"📤 Broadcasting payload: {payload}")
        try:
            push_alert(payload)
        except Exception as e:
            print(f"⚠️ push_alert failed: {e}")

        # 3) Email admins
        admin_recipients = [e for e in getattr(settings, "SECURITY_NOTIFICATION_EMAILS", []) if e]
        if admin_recipients:
            subject = f"[Insider Monitor] Alert for {username} (score {score_pct:.0f}%)"
            body = "\n".join([
                f"User:        {username} (id={user_id})",
                f"Score:       {score_pct:.0f}%",
                f"Reason:      {reason or 'N/A'}",
                f"Timestamp:   {ts_iso}",
                f"Alert ID:    {alert.id}",
                f"Deactivated: {auto_deactivated}",
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

        # 4) Email the end user (warning)
        if user_email:
            try:
                subject = "Security Notice: Unusual Activity Detected"
                lines = [
                    f"Hi {username},",
                    "",
                    "Our system detected unusual activity associated with your account.",
                    f"Detection score: {score_pct:.0f}%.",
                ]
                if score_pct >= DEACTIVATE_CUTOFF:
                    lines += [
                        "",
                        "As a precaution, your account has been temporarily deactivated.",
                        "Please contact the security team or your administrator to regain access.",
                    ]
                else:
                    lines += [
                        "",
                        "No immediate action is required, but please review your recent activity.",
                    ]
                if reason:
                    lines += ["", f"Details: {reason}"]
                lines += ["", f"Time: {ts_iso}", "", "Thank you."]
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
