from django.urls import path

from src.users import views
from src.users.views import *

urlpatterns = [
    path('activate/<int:uid>/<str:token>/', ActivateAccountView.as_view(), name='activate'),
    path('register/', RegistrationView.as_view(), name='register'),

    path('users/view/', CustomUserView.as_view(), name='user-display'),
    path('users/<int:user_id>/detail/', UserDetailView.as_view(), name='user-detail'),
    path('users/<int:user_id>/suspend/', SuspendUserView.as_view()),
    path('users/<int:user_id>/delete/', DeleteUserView.as_view()),

    path('forgot-password/', views.forgot_password, name='forgot_password'),

    # called by your ResetPassword page (POST new password with token)
    path('password-reset-confirm/', views.password_reset_confirm, name='password_reset_confirm')


]