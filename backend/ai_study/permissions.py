from rest_framework import permissions
from django.db.models import Q
from lessons.models import Lesson


def can_access_student(user, student):
    if not getattr(user, 'is_authenticated', False):
        return False
    if user.role == 'admin':
        return True
    if user.role == 'student':
        return user.id == student.id
    if user.role == 'teacher':
        return Lesson.objects.filter(Q(student=student) | Q(group__students=student), teacher=user, is_template=False).exists()
    return False


class CanAccessAIStudySession(permissions.BasePermission):
    def has_object_permission(self, request, view, obj):
        if obj.mode == 'review' and request.method not in permissions.SAFE_METHODS:
            return request.user.id == obj.student_id
        return can_access_student(request.user, obj.student)


class CanAccessSpeakingFeedback(permissions.BasePermission):
    def has_object_permission(self, request, view, obj):
        return can_access_student(request.user, obj.session.student)
