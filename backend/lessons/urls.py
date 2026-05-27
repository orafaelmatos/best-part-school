from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import LessonViewSet, CalendarAPIView, NewWordViewSet, AttachmentViewSet, TeacherAvailabilityAPIView, TeacherBlockedDateViewSet, StudentRecurringScheduleViewSet, HomeworkViewSet, HomeworkAnswerViewSet, HomeworkTemplateViewSet, VocabularyCardViewSet, VocabularyCategoryViewSet, SidebarBadgesAPIView, LessonSummaryViewSet, StudentLessonSummariesAPIView

router = DefaultRouter()
router.register(r'lessons', LessonViewSet, basename='lesson')
router.register(r'new-words', NewWordViewSet, basename='new-word')
router.register(r'lessons-attachments', AttachmentViewSet, basename='attachments')
router.register(r'homework', HomeworkViewSet, basename='homework')
router.register(r'homework-answers', HomeworkAnswerViewSet, basename='homework-answers')
router.register(r'homework-templates', HomeworkTemplateViewSet, basename='homework-templates')
router.register(r'vocabulary-cards', VocabularyCardViewSet, basename='vocabulary-card')
router.register(r'vocabulary-categories', VocabularyCategoryViewSet, basename='vocabulary-category')
router.register(r'lesson-summaries', LessonSummaryViewSet, basename='lesson-summary')
router.register(r'blocked-dates', TeacherBlockedDateViewSet, basename='blocked-dates')
router.register(r'student-schedules', StudentRecurringScheduleViewSet, basename='student-schedules')

urlpatterns = [
    path('calendar/', CalendarAPIView.as_view(), name='calendar'),
    path('sidebar-badges/', SidebarBadgesAPIView.as_view(), name='sidebar-badges'),
    path('students/<uuid:student_id>/lesson-summaries/', StudentLessonSummariesAPIView.as_view(), name='student-lesson-summaries'),
    path('teacher-availability/<uuid:teacher_id>/', TeacherAvailabilityAPIView.as_view(), name='teacher-availability'),
    path('', include(router.urls)),
]
