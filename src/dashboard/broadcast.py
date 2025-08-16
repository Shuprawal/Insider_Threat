# # src/dashboard/broadcast.py
# from __future__ import annotations
#
# from asgiref.sync import async_to_sync
# from channels.layers import get_channel_layer
# from django.conf import settings
# from django.contrib.auth import get_user_model
# from django.core.mail import send_mail
# from django.utils.timezone import now
#
# User = get_user_model()
#
# # Cutoffs are centralized here so there’s only one source of truth.
# HIGH_SEVERITY_CUTOFF = 60  # UI “high”
# DEACTIVATE_CUTOFF    = 75  # auto-deactivate threshold (percent)
#
#
# def _to_pct(v) -> float:
#     """Accept 0..1 or 0..100; return percent 0..100."""
#     try:
#         x = float(v or 0)
#         return x * 100 if x <= 1 else x
#     except Exception:
#         return 0.0
#
#
# def _admins_from_settings() -> list[str]:
#     """
#     SECURITY_NOTIFICATION_EMAILS can be:
#       - a list/tuple of emails, or
#       - a comma/semicolon-separated string
#     Returns a clean list (possibly empty).
#     """
#     raw = getattr(settings, "SECURITY_NOTIFICATION_EMAILS", None)
#     if not raw:
#         return []
#     if isinstance(raw, (list, tuple)):
#         return [s for s in (x.strip() for x in raw) if s]
#     return [s for s in (x.strip() for x in str(raw).replace(";", ",").split(",")) if s]
#
#
# def _normalize_for_ws(payload: dict) -> dict:
#     """
#     Normalize to a stable shape for the frontend.
#     - Score is PERCENT (0..100)
#     - Message derived from (message|reason|details)
#     - Severity derived if not provided
#     """
#     score_pct = _to_pct(
#         payload.get("score")
#         or payload.get("score_pct")
#         or payload.get("adjusted_probability")  # if 0..1
#     )
#
#     user = (
#         payload.get("user")
#         or payload.get("username")
#         or ""
#     )
#
#     message = (
#         payload.get("message")
#         or payload.get("reason")
#         or payload.get("details")
#         or ""
#     )
#
#     severity = payload.get("severity")
#     if not severity:
#         severity = "high" if score_pct >= HIGH_SEVERITY_CUTOFF else "normal"
#
#     return {
#         "type": "threat",
#         "timestamp": payload.get("timestamp") or now().isoformat(),
#         "user": user,
#         "userId": payload.get("userId"),
#         "score": float(score_pct),     # frontend treats this as percent
#         "score_pct": float(score_pct), # keep both for flexible UIs
#         "message": message,
#         "autoSuspended": bool(payload.get("autoSuspended") or False),
#         "severity": severity,
#         # passthroughs if you want them later:
#         "alert_id": payload.get("alert_id"),
#     }
#
#
# async def push_alert_async(payload: dict) -> None:
#     """
#     Async: broadcast to WebSocket, email admins, and optionally deactivate user.
#     Use from async contexts (consumers, async views).
#     """
#     data = _normalize_for_ws(payload)
#
#     # 1) Broadcast to all WebSocket subscribers
#     channel_layer = get_channel_layer()
#     if channel_layer is not None:
#         await channel_layer.group_send("threats", {"type": "threat.event", "data": data})
#
#     # 2) Admin email (best-effort)
#     admin_rcpts = _admins_from_settings()
#     if admin_rcpts:
#         try:
#             subject = f"[Insider Monitor] Alert for {data['user'] or 'Unknown'} (score {data['score']:.0f}%)"
#             body = "\n".join(
#                 [
#                     f"User:       {data['user'] or 'Unknown'} (id={data.get('userId')})",
#                     f"Score:      {data['score']:.0f}%",
#                     f"Severity:   {data.get('severity', 'normal')}",
#                     f"Timestamp:  {data['timestamp']}",
#                     f"AutoSusp:   {data.get('autoSuspended', False)}",
#                     "",
#                     f"Details: {data.get('message') or '(none)'}",
#                 ]
#             )
#             send_mail(
#                 subject=subject,
#                 message=body,
#                 from_email=getattr(settings, "DEFAULT_FROM_EMAIL", None),
#                 recipient_list=admin_rcpts,
#                 fail_silently=True,
#             )
#         except Exception:
#             # don’t crash on mail failures
#             pass
#
#     # 3) Auto-deactivate when score crosses the cutoff
#     try:
#         score_pct = float(data.get("score") or 0)
#         username = data.get("user") or ""
#         if score_pct >= DEACTIVATE_CUTOFF and username:
#             try:
#                 user = User.objects.filter(username=username).first()
#                 if user:
#                     if hasattr(user, "is_suspended"):
#                         if not getattr(user, "is_suspended", False):
#                             user.is_suspended = True
#                             user.save(update_fields=["is_suspended"])
#                     elif hasattr(user, "is_active"):
#                         if getattr(user, "is_active", True):
#                             user.is_active = False
#                             user.save(update_fields=["is_active"])
#             except Exception:
#                 pass
#     except Exception:
#         pass
#
#
# def push_alert(payload: dict) -> None:
#     """
#     Sync wrapper around push_alert_async — safe to call from signals/views.
#     """
#     async_to_sync(push_alert_async)(payload)


# src/dashboard/broadcast.py
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.conf import settings
from django.utils.timezone import now

HIGH_SEVERITY_CUTOFF = 60
def _to_pct(v):
    try:
        x = float(v or 0)
        return x*100 if x <= 1 else x
    except Exception:
        return 0.0

def _normalize_for_ws(p):
    score = _to_pct(p.get("score") or p.get("score_pct") or p.get("adjusted_probability"))
    return {
        "type": "threat",
        "timestamp": p.get("timestamp") or now().isoformat(),
        "user": p.get("user") or p.get("username") or "",
        "userId": p.get("userId"),
        "score": float(score),
        "score_pct": float(score),
        "message": p.get("message") or p.get("reason") or p.get("details") or "",
        "autoSuspended": bool(p.get("autoSuspended") or False),
        "severity": p.get("severity") or ("high" if score >= HIGH_SEVERITY_CUTOFF else "normal"),
    }

def push_alert(payload: dict) -> None:
    data = _normalize_for_ws(payload)
    layer = get_channel_layer()
    if not layer:
        print("⚠️ No channel layer")
        return
    async_to_sync(layer.group_send)("threats", {"type": "threat.event", "data": data})
