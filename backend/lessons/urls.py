from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import LessonViewSet, CalendarAPIView

router = DefaultRouter()
router.register(r'lessons', LessonViewSet, basename='lesson')

urlpatterns = [
    path('calendar/', CalendarAPIView.as_view(), name='calendar'),
    path('', include(router.urls)),
]
