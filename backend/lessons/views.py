from rest_framework import viewsets, permissions, filters
from django_filters.rest_framework import DjangoFilterBackend
from .models import Lesson, NewWord, Attachment
from .serializers import LessonSerializer, NewWordSerializer, AttachmentSerializer
from .permissions import IsStudentOrTeacher
from rest_framework.response import Response
from collections import defaultdict
from rest_framework.views import APIView
from django.utils import timezone

class AttachmentViewSet(viewsets.ModelViewSet):
    serializer_class = AttachmentSerializer
    permission_classes = [permissions.AllowAny]
    queryset = Attachment.objects.all()

class NewWordViewSet(viewsets.ModelViewSet):
    serializer_class = NewWordSerializer
    permission_classes = [permissions.AllowAny]
    queryset = NewWord.objects.all()

    def perform_create(self, serializer):
        lesson_id = self.request.data.get('lesson_id')
        if lesson_id:
            lesson = Lesson.objects.get(id=lesson_id)
            serializer.save(lesson=lesson)
        else:
            serializer.save()

class LessonViewSet(viewsets.ModelViewSet):
    serializer_class = LessonSerializer
    permission_classes = [permissions.AllowAny]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['teacher', 'student', 'status', 'level']
    ordering_fields = ['date', 'created_at']
    ordering = ['date']

    def get_queryset(self):
        user = self.request.user
        qs = Lesson.objects.all().prefetch_related('new_words', 'attachments')
        
        # Filtering logic
        past = self.request.query_params.get('past', None)
        upcoming = self.request.query_params.get('upcoming', None)
        now = timezone.now()

        if past == 'true':
            qs = qs.filter(date__lt=now)
        elif upcoming == 'true':
            qs = qs.filter(date__gte=now)

        if getattr(user, 'is_authenticated', False):
            if user.role == 'admin':
                return qs
            if user.role == 'teacher':
                return qs.filter(teacher=user)
            return qs.filter(student=user)
        return qs

    def perform_create(self, serializer):
        # Temporarily disabled auth check for testing
        serializer.save()

class CalendarAPIView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request, format=None):
        qs = Lesson.objects.all()
        user = request.user
        if getattr(user, 'is_authenticated', False):
            if user.role == 'teacher':
                qs = qs.filter(teacher=user)
            elif user.role == 'student':
                qs = qs.filter(student=user)
            
        data = defaultdict(list)
        for lesson in qs:
            date_str = lesson.date.strftime('%Y-%m-%d')
            data[date_str].append({
                'id': lesson.id,
                'title': lesson.title,
                'status': lesson.status,
                'level': lesson.level,
                'time': lesson.date.strftime('%H:%M:%S')
            })
            
        return Response(data)
