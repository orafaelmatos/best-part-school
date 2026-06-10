from django.urls import include, path
from rest_framework.routers import DefaultRouter
from .views import (
    AIStudyProgressOverviewAPIView,
    AIStudyRecommendationAPIView,
    AIStudySessionViewSet,
    ContextLessonsAPIView,
    SpeakingFeedbackViewSet,
)

router = DefaultRouter()
router.register(r'sessions', AIStudySessionViewSet, basename='ai-study-session')
router.register(r'feedback', SpeakingFeedbackViewSet, basename='ai-study-feedback')

urlpatterns = [
    path('context-lessons/', ContextLessonsAPIView.as_view(), name='ai-study-context-lessons'),
    path('progress/overview/', AIStudyProgressOverviewAPIView.as_view(), name='ai-study-progress-overview'),
    path('recommendations/current/', AIStudyRecommendationAPIView.as_view(), name='ai-study-recommendation-current'),
    path('', include(router.urls)),
]
