from rest_framework import permissions
from django.contrib.auth import get_user_model
from django.db.models import Q


def visible_students(user):
    students = get_user_model().objects.filter(role='student')
    if user.role == 'admin':
        return students
    if user.role == 'student':
        return students.filter(pk=user.pk)
    if user.role == 'teacher':
        return students.filter(Q(lessons_attended__teacher=user) | Q(student_groups__teacher=user)
                               | Q(student_groups__lessons__teacher=user)).distinct()
    return students.none()


def can_access_student(user, student):
    if not getattr(user, 'is_authenticated', False):
        return False
    if user.role == 'admin':
        return True
    if user.role == 'student':
        return user.id == student.id
    if user.role == 'teacher':
        return visible_students(user).filter(pk=student.pk).exists()
    return False


class CanAccessAIStudySession(permissions.BasePermission):
    def has_object_permission(self, request, view, obj):
        if (obj.guided_state or {}).get('interpreter') and obj.student_id == request.user.id:
            return True
        if obj.mode in {'speaking', 'writing'} and request.user.role == 'teacher' and request.method not in permissions.SAFE_METHODS:
            return False
        if (obj.guided_state or {}).get('interpreter') and request.user.role == 'teacher' and request.method not in permissions.SAFE_METHODS:
            return view.action == 'interpreter_audio' and can_access_student(request.user, obj.student)
        return can_access_student(request.user, obj.student)


class CanAccessSpeakingFeedback(permissions.BasePermission):
    def has_object_permission(self, request, view, obj):
        return can_access_student(request.user, obj.session.student)
