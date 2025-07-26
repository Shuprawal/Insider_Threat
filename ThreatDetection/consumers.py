from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer
import json
import jwt
from django.conf import settings
from ThreatDetection.models import CustomUser

class ThreatConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        query_string = self.scope["query_string"].decode()
        token = None
        if "token=" in query_string:
            token = query_string.split("token=")[-1]

        if token:
            try:
                payload = jwt.decode(token, settings.SECRET_KEY, algorithms=['HS256'])
                user_id = payload.get("user_id")
                user = await self.get_user(user_id)
                if user:
                    await self.channel_layer.group_add("threats", self.channel_name)
                    await self.accept()
                    return
            except jwt.ExpiredSignatureError:
                print("Token expired")
            except jwt.DecodeError:
                print("Token invalid")

        await self.close()

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard("threats", self.channel_name)

    async def send_threat_alert(self, event):
        await self.send(text_data=json.dumps(event['data']))

    @database_sync_to_async
    def get_user(self, user_id):
        return CustomUser.objects.filter(id=user_id).first()
