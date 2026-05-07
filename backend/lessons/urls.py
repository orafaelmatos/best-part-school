from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import LessonViewSet, CalendarAPIView, NewWordViewSet, AttachmentViewSet, TeacherAvailabilityAPIView, TeacherBlockedDateViewSet, StudentRecurringScheduleViewSet

router = DefaultRouter()
router.register(r'lessons', LessonViewSet, basename='lesson')
router.register(r'new-words', NewWordViewSet, basename='new-word')
router.register(r'lessons-attachments', AttachmentViewSet, basename='attachments')
router.register(r'blocked-dates', TeacherBlockedDateViewSet, basename='blocked-dates')
router.register(r'student-schedules', StudentRecurringScheduleViewSet, basename='student-schedules')

urlpatterns = [
    path('calendar/', CalendarAPIView.as_view(), name='calendar'),
    path('teacher-availability/<uuid:teacher_id>/', TeacherAvailabilityAPIView.as_view(), name='teacher-availability'),
    path('', include(router.urls)),
]
