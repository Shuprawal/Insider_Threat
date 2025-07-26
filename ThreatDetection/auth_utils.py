# auth_utils.py
from ThreatDetection.models import CustomUser

# def get_user_from_auth_token(request):
#     header_value = request.headers.get('Authorization', '')
#     if header_value.startswith("Bearer "):
#         token = header_value.split(" ")[1]
#         try:
#             return CustomUser.objects.get(auth_token=token)
#         except CustomUser.DoesNotExist:
#             return None
#     return None

import jwt
from django.conf import settings
from ThreatDetection.models import CustomUser

from django.contrib.auth import get_user_model

def get_user_from_auth_token(request):
    auth_header = request.headers.get('Authorization')
    if not auth_header or not auth_header.startswith('Bearer '):
        print("🚫 No valid Authorization header found.")
        return None

    token = auth_header.split('Bearer ')[1].strip()
    print("🔐 Authorization Header:", auth_header)
    print("🔑 Token extracted:", token)

    try:
        decoded = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
        user_id = decoded.get('user_id')
        print("🧠 Decoded user_id:", user_id)

        print("👀 Checking user with ID:", user_id)
        print("📋 All user IDs:", list(CustomUser.objects.values_list('id', flat=True)))
        user = CustomUser.objects.filter(id=user_id).first()
        print("🔎 User found:", user)

        print("👀 Query result:", user)
        print("✅ All users now:", CustomUser.objects.all())

        return user

    except jwt.ExpiredSignatureError:
        print("⏰ Token has expired")
    except jwt.InvalidTokenError as e:
        print("❌ Invalid token:", str(e))

    print("✅ All users now:", CustomUser.objects.all())

    return None



import jwt
from django.conf import settings
from datetime import datetime, timedelta, timezone


def generate_auth_token(user):
    payload = {
        'user_id': user.id,
        'exp': datetime.now(timezone.utc) + timedelta(days=1),
        'iat': datetime.now(timezone.utc),
    }
    token = jwt.encode(payload, settings.SECRET_KEY, algorithm='HS256')

    if isinstance(token, bytes):
        token = token.decode('utf-8')

    return token
