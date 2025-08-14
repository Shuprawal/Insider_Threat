import os
from django.core.asgi import get_asgi_application
from channels.routing import ProtocolTypeRouter, URLRouter
from channels.auth import AuthMiddlewareStack
from channels.security.websocket import AllowedHostsOriginValidator
from src.dashboard import routing
from src import dashboard



os.environ.setdefault("DJANGO_SETTINGS_MODULE", "Dissertation.settings")

application = ProtocolTypeRouter({
    "http": get_asgi_application(),
    "websocket": AllowedHostsOriginValidator(
        AuthMiddlewareStack(
            URLRouter(dashboard.routing.websocket_urlpatterns)
        )
    ),
})

