from django.http import JsonResponse
from .views import SESSION_STORE
from .models import CustomUser

def custom_auth_required(view_func):
    def wrapper(request, *args, **kwargs):
        token = request.headers.get('Authorization', '').replace('Bearer ', '')
        user_id = SESSION_STORE.get(token)
        if not user_id:
            print('is it')
            return JsonResponse({'error': 'Unauthorized'}, status=401)
        request.custom_user = CustomUser.objects.get(id=user_id)
        return view_func(request, *args, **kwargs)
    return wrapper
