from django.urls import path
from .views import RegisterView, CustomTokenObtainPairView, UserListView, UserDetailView, StudentGroupListCreateView
from rest_framework_simplejwt.views import TokenRefreshView
from .privacy import AIConsentView, DeleteOwnAccountView

urlpatterns = [
    path('ai-consent/', AIConsentView.as_view(), name='ai-consent'),
    path('me/delete/', DeleteOwnAccountView.as_view(), name='delete-own-account'),
    path('register/', RegisterView.as_view(), name='register'),
    path('student-groups/', StudentGroupListCreateView.as_view(), name='student-groups'),
    path('login/', CustomTokenObtainPairView.as_view(), name='login'),
    path('token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),   
    path('users/', UserListView.as_view(), name='users-list'),
    path('users/<uuid:pk>/', UserDetailView.as_view(), name='users-detail'), ]
