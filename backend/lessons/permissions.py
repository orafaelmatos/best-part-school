from rest_framework import permissions

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
