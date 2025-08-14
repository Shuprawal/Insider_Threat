from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.utils.timezone import now

def _normalize(payload: dict) -> dict:
    return {
        "type": "threat",
        "timestamp": payload.get("timestamp") or now().isoformat(),
        "user": payload.get("user") or payload.get("username") or "",
        "score": float(payload.get("score") or 0.0),  # treat as percent if you send percent
        "message": payload.get("message") or payload.get("reason") or payload.get("details") or "",
        "userId": payload.get("userId"),
        "autoSuspended": bool(payload.get("autoSuspended", False)),
        "severity": payload.get("severity", "normal"),
    }

def push_alert(payload: dict) -> None:
    data = _normalize(payload)
    async_to_sync(get_channel_layer().group_send)(
        "threats",
        {"type": "threat.event", "data": data}
    )
