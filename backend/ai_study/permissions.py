from rest_framework import permissions


def can_access_student(user, student):
    if not getattr(user, 'is_authenticated', False):
        return False
    if user.role == 'admin':
        return True
    if user.role == 'student':
        return user.id == student.id
    if user.role == 'teacher':
        return student.lessons_attended.filter(teacher=user).exists()
    return False


class CanAccessAIStudySession(permissions.BasePermission):
    def has_object_permission(self, request, view, obj):
        return can_access_student(request.user, obj.student)


class CanAccessSpeakingFeedback(permissions.BasePermission):
    def has_object_permission(self, request, view, obj):
        return can_access_student(request.user, obj.session.student)
