from django.urls import path

from src.users.views import *

urlpatterns = [

    path('users/view/', CustomUserView.as_view(), name='user-display'),
    path('users/<int:user_id>/detail/', UserDetailView.as_view(), name='user-detail'),
    path('users/<int:user_id>/suspend/', SuspendUserView.as_view()),
    path('users/<int:user_id>/delete/', DeleteUserView.as_view()),

]