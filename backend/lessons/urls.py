from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import LessonViewSet, CalendarAPIView, NewWordViewSet, AttachmentViewSet

router = DefaultRouter()
router.register(r'lessons', LessonViewSet, basename='lesson')
router.register(r'new-words', NewWordViewSet, basename='new-word')
router.register(r'lessons-attachments', AttachmentViewSet, basename='attachments')

urlpatterns = [
    path('calendar/', CalendarAPIView.as_view(), name='calendar'),
    path('', include(router.urls)),
]
