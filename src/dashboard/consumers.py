# src/dashboard/consumers.py
from __future__ import annotations

import jwt
from urllib.parse import parse_qs

from channels.generic.websocket import AsyncJsonWebsocketConsumer
from django.conf import settings

class ThreatConsumer(AsyncJsonWebsocketConsumer):
    async def connect(self):
        # 1) Parse & validate JWT BEFORE accepting
        qs = parse_qs(self.scope.get("query_string", b"").decode())
        token = (qs.get("token") or [None])[0]
        if not token:
            await self.close(code=4001)
            return

        try:
            payload = jwt.decode(
                token.strip(),
                settings.JWT_SECRET,
                algorithms=[getattr(settings, "JWT_ALGORITHM", "HS256")],
            )
            self.user_id = payload.get("user_id")
            if not self.user_id:
                await self.close(code=4004)  # token ok but no user_id
                return
        except Exception:
            await self.close(code=4003)  # invalid token
            return


        print("WS CONNECTED channel:", self.channel_name)
        await self.accept()
        if self.channel_layer is not None:
            try:
                await self.channel_layer.group_add("threats", self.channel_name)
            except Exception:
                # don’t kill the socket if group add fails
                pass

        # 3) System hello (frontend ignores system messages)
        await self.send_json({"type": "hello", "ok": True, "system": True})

    async def disconnect(self, code):
        try:
            if self.channel_layer is not None:
                await self.channel_layer.group_discard("threats", self.channel_name)
        except Exception:
            pass

    async def receive_json(self, content, **kwargs):
        # simple ping/pong
        if content.get("type") == "ping":
            await self.send_json({"type": "pong"})

    # >>> HANDLERS FOR GROUP EVENTS <<<

    # Matches events sent with {"type": "threat.event", "data": {...}}
    async def threat_event(self, event):
        # Forward payload to the client

        try:
            print("WS threat_event ->", event.get("data"))
        except Exception:
            pass
        await self.send_json(event.get("data") or {})
        # await self.send_json(event.get("data") or {})

    # Back-compat: if any publisher uses "send_threat_alert"
    async def send_threat_alert(self, event):
        data = dict(event.get("data") or {})
        data.setdefault("type", "threat")
        data.setdefault("user", data.get("username", ""))
        data.setdefault("message", data.get("reason", "") or data.get("details", ""))
        await self.send_json(data)
