from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import PracticeSessionViewSet

router = DefaultRouter()
router.register(r'sessions', PracticeSessionViewSet, basename='practice-session')

urlpatterns = [
    path('', include(router.urls)),
]