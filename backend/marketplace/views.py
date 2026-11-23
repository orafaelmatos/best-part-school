from rest_framework import serializers, viewsets, permissions
from .models import Course
from .serializers import CourseSerializer
from accounts.access import is_admin
from rest_framework.exceptions import PermissionDenied

class CourseViewSet(viewsets.ModelViewSet):
    queryset = Course.objects.all().order_by('-created_at', 'id')
    serializer_class = CourseSerializer
    
    def get_permissions(self):
        if self.request.method in permissions.SAFE_METHODS:
            return [permissions.AllowAny()]
        return [permissions.IsAuthenticated()]

    def get_queryset(self):
        qs = super().get_queryset()
        if self.request.method not in permissions.SAFE_METHODS and not is_admin(self.request.user):
            return qs.filter(created_by=self.request.user)
        return qs
        
    def perform_create(self, serializer):
        user = self.request.user
        if not is_admin(user) and user.role != 'teacher':
            raise PermissionDenied('Somente a escola pode cadastrar cursos.')
        serializer.save(created_by=user)

    def perform_update(self, serializer):
        if not is_admin(self.request.user) and self.request.user.role != 'teacher':
            raise PermissionDenied('Somente a escola pode alterar cursos.')
        serializer.save()

    def perform_destroy(self, instance):
        if not is_admin(self.request.user) and self.request.user.role != 'teacher':
            raise PermissionDenied('Somente a escola pode excluir cursos.')
        instance.delete()
