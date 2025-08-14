# src/users/urls.py
from django.urls import path
from django.http import JsonResponse

from .views import (
    ActivateAccountView,
    RegistrationView,
    CustomUserView,
    UserDetailView,
    SuspendUserView,
    DeleteUserView,
    AdministrativeUserProfileEditView,
    forgot_password,
    password_reset_confirm,
)

app_name = "users"



urlpatterns = [


    # auth & registration
    path('activate/<int:uid>/<str:token>/', ActivateAccountView.as_view(), name='activate'),
    path('register/', RegistrationView.as_view(), name='register'),

    # password reset
    path('forgot-password/', forgot_password, name='forgot_password'),
    path('password-reset-confirm/', password_reset_confirm, name='password_reset_confirm'),

    # users browse/detail (your working detail endpoint)
    path('delete-user/', DeleteUserView.as_view(), name='delete_user'),

    path('users/<int:user_id>/detail/', UserDetailView.as_view(), name='user-detail'),

    # ✅ EDIT endpoints (GET edit payload; PATCH/PUT/POST update)
    # Include both with and without trailing slash just in case APPEND_SLASH is off
    path('users/<int:user_id>/edit/', AdministrativeUserProfileEditView.as_view(), name='user-edit'),
    path('users/<int:user_id>/edit', AdministrativeUserProfileEditView.as_view(), name='user-edit-no-slash'),

    # Optional: allow root form too (PATCH /api/users/:id/)
    path('users/view/', CustomUserView.as_view(), name='users_view'),
    path('users/<int:user_id>/', AdministrativeUserProfileEditView.as_view(), name='user-edit-root'),
]
