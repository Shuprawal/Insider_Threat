# import os
# from django.core.asgi import get_asgi_application
# from channels.routing import ProtocolTypeRouter, URLRouter
# from channels.auth import AuthMiddlewareStack
# from channels.security.websocket import AllowedHostsOriginValidator
# import threats.routing  # <- create this app/module
#
# os.environ.setdefault("DJANGO_SETTINGS_MODULE", "Dissertation.settings")
#
# application = ProtocolTypeRouter({
#     "http": get_asgi_application(),
#     "websocket": AllowedHostsOriginValidator(
#         AuthMiddlewareStack(
#             URLRouter(threats.routing.websocket_urlpatterns)
#         )
#     ),
# })
