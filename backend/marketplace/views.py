from rest_framework import serializers, viewsets, permissions
from .models import Course
from .serializers import CourseSerializer

class CourseViewSet(viewsets.ModelViewSet):
    queryset = Course.objects.all()
    serializer_class = CourseSerializer
    
    def get_permissions(self):
        return [permissions.AllowAny()]
        
    def perform_create(self, serializer):
        from django.contrib.auth import get_user_model
        user = self.request.user
        if not user.is_authenticated:
            user = get_user_model().objects.first()
        if user is None:
            raise serializers.ValidationError({'created_by': 'Nenhum usuario disponivel para criar o curso.'})
        serializer.save(created_by=user)
