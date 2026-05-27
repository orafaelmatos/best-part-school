from django.urls import include, path
from rest_framework.routers import DefaultRouter
from .views import AIStudySessionViewSet, ContextLessonsAPIView, SpeakingFeedbackViewSet

router = DefaultRouter()
router.register(r'sessions', AIStudySessionViewSet, basename='ai-study-session')
router.register(r'feedback', SpeakingFeedbackViewSet, basename='ai-study-feedback')

urlpatterns = [
    path('context-lessons/', ContextLessonsAPIView.as_view(), name='ai-study-context-lessons'),
    path('', include(router.urls)),
]
