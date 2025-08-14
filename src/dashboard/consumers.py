import jwt
from urllib.parse import parse_qs
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from django.conf import settings


class ThreatConsumer(AsyncJsonWebsocketConsumer):
    async def connect(self):
        # auth via ?token=...
        qs = parse_qs(self.scope["query_string"].decode())
        token = (qs.get("token") or [None])[0]
        if not token:
            await self.close(code=4001)
            return

        try:
            payload = jwt.decode(
                token,
                settings.JWT_SECRET,
                algorithms=[getattr(settings, "JWT_ALGORITHM", "HS256")],
            )
            self.user_id = payload.get("user_id")
        except Exception:
            await self.close(code=4003)
            return

        await self.channel_layer.group_add("threats", self.channel_name)
        await self.accept()
        await self.send_json({"type": "hello", "ok": True})

    async def disconnect(self, code):
        await self.channel_layer.group_discard("threats", self.channel_name)

    async def receive_json(self, content, **kwargs):
        if content.get("type") == "ping":
            await self.send_json({"type": "pong"})

    # Group event handler used by broadcast.push_alert(...)
    async def threat_event(self, event):
        await self.send_json(event["data"])

    # Back-compat if some producer still sends type="send_threat_alert"
    async def send_threat_alert(self, event):
        data = event["data"]
        data.setdefault("type", "threat")
        data.setdefault("user", data.get("username", ""))
        data.setdefault("message", data.get("reason", "") or data.get("details", ""))
        await self.send_json(data)
