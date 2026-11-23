from rest_framework import permissions
from django.db.models import Q
from accounts.access import is_admin


def visible_lessons(user):
    from .models import Lesson
    qs = Lesson.objects.all()
    if not user.is_authenticated:
        return qs.none()
    if is_admin(user):
        return qs
    if user.role == 'teacher':
        return qs.filter(Q(teacher=user) | Q(is_template=True))
    return qs.filter(Q(student=user) | Q(group__students=user)).distinct()


class LessonAccess(permissions.BasePermission):
    message = 'Somente professores responsáveis e administradores podem alterar aulas.'
    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        return getattr(view, 'action', '') not in {'create', 'create_extra_lesson'} or is_admin(request.user) or request.user.role == 'teacher'

    def has_object_permission(self, request, view, obj):
        if request.method in permissions.SAFE_METHODS:
            return visible_lessons(request.user).filter(pk=obj.pk).exists()
        return is_admin(request.user) or (request.user.role == 'teacher' and obj.teacher_id == request.user.pk)

class IsStudentOrTeacher(permissions.BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated

    def has_object_permission(self, request, view, obj):
        if request.user.role == 'admin':
            return True
        if request.user.role == 'teacher':
            return obj.teacher == request.user
        if request.user.role == 'student':
            # student can only view
            return obj.student == request.user and request.method in permissions.SAFE_METHODS
        return False
