# # src/alerts/signals.py
# from __future__ import annotations
#
# from django.db.models.signals import post_save
# from django.dispatch import receiver
# from django.db import transaction
# from django.utils import timezone as dj_tz
#
# from ThreatDetection.models import Alerts
# from src.dashboard.broadcast import push_alert
#
#
# def _ts_iso_utc(ts):
#     """Return ISO string in UTC with 'Z' suffix; default = now()."""
#     if ts is None:
#         ts = dj_tz.now()
#     if dj_tz.is_naive(ts):
#         ts = dj_tz.make_aware(ts, dj_tz.get_current_timezone())
#     z = ts.astimezone(dj_tz.utc)
#     return z.isoformat().replace("+00:00", "Z")
#
#
# @receiver(post_save, sender=Alerts)
# def on_alert_created(sender, instance: Alerts, created: bool, **kwargs):
#     """
#     Keep this VERY thin:
#       - Re‑fetch with relations after commit
#       - Build a clean payload
#       - Hand off to broadcast.push_alert(...)
#     """
#     if not created:
#         return
#
#     def _after_commit():
#         try:
#             alert = Alerts.objects.select_related("log", "log__user").get(pk=instance.pk)
#         except Alerts.DoesNotExist:
#             print("⚠️ Alerts.on_alert_created: alert vanished before commit; skipping.")
#             return
#
#         log  = getattr(alert, "log", None)
#         user = getattr(log, "user", None)
#
#         username   = getattr(user, "username", "Unknown")
#         user_id    = getattr(user, "id", None)
#         score_raw  = getattr(alert, "score", None)         # can be 0..1 or 0..100 (handled later)
#         reason     = (getattr(alert, "reason", None)
#                       or getattr(log, "activity_type", None)
#                       or "Suspicious activity")
#         details    = (getattr(log, "details", "") or "")[:500]
#         ts_raw     = getattr(log, "timestamp", None)
#         ts_iso     = _ts_iso_utc(ts_raw)
#
#         payload = {
#             # The broadcast helper can normalize everything else.
#             "username": username,
#             "userId": user_id,
#             "timestamp": ts_iso,
#             "score": score_raw,     # leave as-is; broadcast will convert to percent
#             "reason": reason,
#             "details": details,
#             "alert_id": getattr(alert, "id", None),
#             # You can pass an explicit severity if you want to override:
#             # "severity": "high" / "normal"
#         }
#
#         print(f"📤 signals -> push_alert: {payload}")
#         try:
#             push_alert(payload)  # sync wrapper; safe to call from signals
#         except Exception as e:
#             print(f"⚠️ push_alert failed from signals: {e}")
#
#     transaction.on_commit(_after_commit)

# src/alerts/signals.py from django.db.models.signals import post_save from django.dispatch import receiver from django.db import transaction from django.conf import settings from django.core.mail import send_mail from django.utils import timezone as dj_tz from ThreatDetection.models import Alerts # your Alerts model from src.dashboard.broadcast import push_alert HIGH_SEVERITY_CUTOFF = 60 # UI "high" threshold DEACTIVATE_CUTOFF = 60 # percent => deactivate user def _to_pct(score) -> float: """Accept 0..1 or 0..100; return percent in 0..100 range.""" try: s = float(score or 0) return s * 100 if s <= 1 else s except Exception: return 0.0 def _ts_iso_utc(ts): """Return ISO string in UTC with 'Z' suffix.""" if ts is None: ts = dj_tz.now() if dj_tz.is_naive(ts): ts = dj_tz.make_aware(ts, dj_tz.get_current_timezone()) z = ts.astimezone(dj_tz.utc) return z.isoformat().replace("+00:00", "Z") @receiver(post_save, sender=Alerts) def on_alert_created(sender, instance, created, **kwargs): if not created: return # Defer all side-effects until after DB commit def _after_commit(): # Re-fetch with relations to avoid stale/partial objects try: alert = Alerts.objects.select_related("log", "log__user").get(pk=instance.pk) except Alerts.DoesNotExist: print("⚠️ Alerts.on_alert_created: alert vanished before commit; skip.") return log = getattr(alert, "log", None) user = getattr(log, "user", None) # Score normalization score_raw = getattr(alert, "score", None) score_pct = _to_pct(score_raw) # Basic fields username = getattr(user, "username", "Unknown") user_id = getattr(user, "id", None) user_email = getattr(user, "email", None) ts_raw = getattr(log, "timestamp", None) ts_iso = _ts_iso_utc(ts_raw) reason = (getattr(alert, "reason", None) or getattr(log, "activity_type", None) or "Suspicious activity") details = (getattr(log, "details", "") or "")[:500] # Debug print("🚨 Alerts signal fired!") print(f" alert_id={alert.id} user={username} (id={user_id})") print(f" score_raw={score_raw} -> score_pct={score_pct:.2f}") print(f" ts={ts_raw} -> {ts_iso}") print(f" reason='{reason}' details_len={len(details)}") auto_deactivated = False try: if user and score_pct >= DEACTIVATE_CUTOFF: print(f"🔍 Auto-deactivation check for '{username}' (id={user_id}), score={score_pct:.2f}%") if hasattr(user, "is_suspended"): if not getattr(user, "is_suspended", False): user.is_suspended = True user.save(update_fields=["is_suspended"]) print(f"✅ '{username}' (id={user_id}) is now SUSPENDED in the DB.") else: print(f"ℹ️ '{username}' (id={user_id}) was already suspended.") else: print(f"ℹ️ No deactivation — score {score_pct:.2f}% is below cutoff {DEACTIVATE_CUTOFF}%") except Exception as e: print(f"⚠️ Deactivate user failed: {e}") # 2) Broadcast to the websocket UI payload = { "username": username, "userId": user_id, "timestamp": ts_iso, "score": score_pct, "score_pct": score_pct, # Also include a 0..1 field if score_raw looks like a probability "adjusted_probability": float(score_raw) if (score_raw is not None and float(score_raw) <= 1) else None, "reason": reason, "details": details, "autoSuspended": auto_deactivated, "severity": "high" if score_pct >= HIGH_SEVERITY_CUTOFF else "normal", "alert_id": alert.id, } print(f"📤 Broadcasting payload: {payload}") try: push_alert(payload) except Exception as e: print(f"⚠️ push_alert failed: {e}") # 3) Email admins admin_recipients = [e for e in getattr(settings, "SECURITY_NOTIFICATION_EMAILS", []) if e] if admin_recipients: print('admin email') subject = f"[Insider Monitor] Alert for {username} (score {score_pct:.0f}%)" body = "\n".join([ f"User: {username} (id={user_id})", f"Score: {score_pct:.0f}%", f"Reason: {reason or 'N/A'}", f"Timestamp: {ts_iso}", f"Alert ID: {alert.id}", f"Deactivated: {auto_deactivated}", "", f"Details: {details}" if details else "Details: (none)", ]) try: send_mail( subject=subject, message=body, from_email=getattr(settings, "DEFAULT_FROM_EMAIL", None), recipient_list=admin_recipients, fail_silently=True, ) except Exception as e: print(f"⚠️ admin email failed: {e}") # 4) Email the end user (warning) if user_email: try: subject = "Security Notice: Unusual Activity Detected" lines = [ f"Hi {username},", "", "Our system detected unusual activity associated with your account.", f"Detection score: {score_pct:.0f}%.", ] print('mail') if score_pct >= DEACTIVATE_CUTOFF: lines += [ "", "As a precaution, your account has been temporarily deactivated.", "Please contact the security team or your administrator to regain access.", ] else: lines += [ "", "No immediate action is required, but please review your recent activity.", ] if reason: lines += ["", f"Details: {reason}"] lines += ["", f"Time: {ts_iso}", "", "Thank you."] send_mail( subject=subject, message="\n".join(lines), from_email=getattr(settings, "DEFAULT_FROM_EMAIL", None), recipient_list=[user_email], fail_silently=True, ) print('done') except Exception as e: print(f"⚠️ user email failed: {e}") transaction.on_commit(_after_commit) from asgiref.sync import async_to_sync from channels.layers import get_channel_layer from django.utils.timezone import now def _normalize(payload: dict) -> dict: print('on the way') print(payload) return { "type": "threat", "timestamp": payload.get("timestamp") or now().isoformat(), "user": payload.get("user") or payload.get("username") or "", "score": float(payload.get("score") or 0.0), # treat as percent if you send percent "message": payload.get("message") or payload.get("reason") or payload.get("details") or "", "userId": payload.get("userId"), "autoSuspended": bool(payload.get("autoSuspended", False)), "severity": payload.get("severity", "normal"), } def push_alert(payload: dict) -> None: print('is it happening') data = _normalize(payload) async_to_sync(get_channel_layer().group_send)( "threats", {"type": "threat.event", "data": data} )
from __future__ import annotations

from django.db.models.signals import post_save
from django.dispatch import receiver
from django.db import transaction
from django.conf import settings
from django.core.mail import send_mail
from django.utils import timezone as dj_tz

from ThreatDetection.models import Alerts
from src.dashboard.broadcast import push_alert as broadcast_push_alert

# Tunables (can be moved to settings if you prefer)
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
