from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed
import jwt
from django.conf import settings
from ThreatDetection.models import CustomUser


class CustomTokenAuthentication(BaseAuthentication):
    def authenticate(self, request):
        print("🔥🔥🔥 CustomTokenAuthentication called 🔥🔥🔥")

        auth_header = request.headers.get('Authorization')
        print("🔐 Raw Authorization Header:", auth_header)

        if not auth_header or not auth_header.startswith('Bearer '):
            print("⛔️ No or malformed Authorization header")
            return None

        token = auth_header.split(' ')[1]
        print("🔑 Token extracted:", token)

        try:
            payload = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
            print("📦 Decoded JWT payload:", payload)

            user_id = payload.get('user_id')
            if user_id is None:
                print("❌ No user_id in token")
                raise AuthenticationFailed("Invalid token: missing user_id")

            user = CustomUser.objects.get(id=user_id)  # <--- use get here
            print("🧠 Fetched User from DB:", user)

            return (user, None)

        except CustomUser.DoesNotExist:
            print("🧠 Matched user ID: None")
            raise AuthenticationFailed("User not found")

        except jwt.ExpiredSignatureError:
            print("❌ Token expired")
            raise AuthenticationFailed("Token expired")

        except jwt.DecodeError as e:
            print(f"❌ Token decode error: {e}")
            raise AuthenticationFailed("Token invalid")

        except Exception as e:
            print(f"❌ Unexpected error: {e}")
            raise AuthenticationFailed("Authentication error")
