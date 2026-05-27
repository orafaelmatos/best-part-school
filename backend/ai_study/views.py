from django.shortcuts import get_object_or_404
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView
from lessons.models import Lesson
from .models import AIConversationMessage, AIStudySession, SpeakingFeedback
from .permissions import CanAccessAIStudySession, CanAccessSpeakingFeedback, can_access_student
from .serializers import (
    AIConversationMessageSerializer,
    AIStudySessionSerializer,
    LessonContextOptionSerializer,
    SetContextLessonsSerializer,
    SpeakingAudioUploadSerializer,
    SpeakingFeedbackSerializer,
    TextMessageSerializer,
)
from .services import AIStudyContextService, AIStudyOpenAIService, AIStudyWorkflowService


class AIStudySessionViewSet(viewsets.ModelViewSet):
    serializer_class = AIStudySessionSerializer
    permission_classes = [permissions.IsAuthenticated, CanAccessAIStudySession]

    def get_queryset(self):
        user = self.request.user
        qs = AIStudySession.objects.select_related('student').prefetch_related('context_lessons__lesson', 'messages')
        if user.role == 'admin':
            return qs
        if user.role == 'teacher':
            return qs.filter(student__lessons_attended__teacher=user).distinct()
        return qs.filter(student=user)

    def perform_create(self, serializer):
        session = serializer.save(student=self.request.user)
        session.auto_context = AIStudyContextService.build_auto_context(session)
        session.save(update_fields=['auto_context'])
        AIConversationMessage.objects.create(
            session=session,
            role='assistant',
            content_type='text',
            text="Hi! I'm ready to practice with you. Choose your lesson context or start speaking when you're ready.",
            metadata={'initial': True, 'supports_streaming': True},
        )

    @action(detail=True, methods=['post'])
    def contexts(self, request, pk=None):
        session = self.get_object()
        serializer = SetContextLessonsSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        AIStudyContextService.set_context_lessons(session, serializer.validated_data['lesson_ids'])
        return Response(AIStudySessionSerializer(session, context={'request': request}).data)

    @action(detail=True, methods=['get'])
    def history(self, request, pk=None):
        session = self.get_object()
        messages = session.messages.select_related('audio', 'feedback').order_by('created_at')
        return Response(AIConversationMessageSerializer(messages, many=True, context={'request': request}).data)

    @action(detail=True, methods=['post'], parser_classes=[MultiPartParser, FormParser])
    def audio(self, request, pk=None):
        session = self.get_object()
        serializer = SpeakingAudioUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        feedback = AIStudyWorkflowService.handle_audio_upload(
            session,
            serializer.validated_data['audio'],
            serializer.validated_data.get('duration_seconds'),
        )
        latest_message = session.messages.filter(feedback=feedback, role='assistant').last()
        return Response({
            'feedback': SpeakingFeedbackSerializer(feedback, context={'request': request}).data,
            'message': AIConversationMessageSerializer(latest_message, context={'request': request}).data if latest_message else None,
        }, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def message(self, request, pk=None):
        session = self.get_object()
        serializer = TextMessageSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        text = serializer.validated_data.get('text', '').strip()
        if not text:
            return Response({'error': 'text is required.'}, status=status.HTTP_400_BAD_REQUEST)
        AIConversationMessage.objects.create(session=session, role='user', content_type='text', text=text)
        ai_text = AIStudyOpenAIService.generate_chat_response(session, text)
        message = AIConversationMessage.objects.create(
            session=session,
            role='assistant',
            content_type='text',
            text=ai_text,
            metadata={'supports_streaming': True},
        )
        return Response(AIConversationMessageSerializer(message, context={'request': request}).data)


class SpeakingFeedbackViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = SpeakingFeedbackSerializer
    permission_classes = [permissions.IsAuthenticated, CanAccessSpeakingFeedback]

    def get_queryset(self):
        user = self.request.user
        qs = SpeakingFeedback.objects.select_related('session__student', 'audio').prefetch_related('reviews')
        if user.role == 'admin':
            return qs
        if user.role == 'teacher':
            return qs.filter(session__student__lessons_attended__teacher=user).distinct()
        return qs.filter(session__student=user)

    @action(detail=True, methods=['post'])
    def tts(self, request, pk=None):
        feedback = self.get_object()
        if feedback.tts_audio_url:
            return Response({'audio_url': feedback.tts_audio_url})
        text = feedback.corrected_sentence or feedback.natural_sentence or feedback.native_alternative_sentence
        if not text:
            return Response({'error': 'No corrected or natural sentence available for TTS.'}, status=status.HTTP_400_BAD_REQUEST)
        feedback.tts_audio_url = AIStudyOpenAIService.generate_tts(text)
        feedback.save(update_fields=['tts_audio_url'])
        return Response({'audio_url': feedback.tts_audio_url})


class ContextLessonsAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        student_id = request.query_params.get('student')
        student = None
        if student_id:
            lesson = Lesson.objects.filter(student_id=student_id).select_related('student').first()
            student = lesson.student if lesson else None
            if not student or not can_access_student(request.user, student):
                return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        qs = AIStudyContextService.filter_lessons(request.user, request.query_params)
        if student:
            qs = qs.filter(student=student)
        return Response(LessonContextOptionSerializer(qs[:100], many=True).data)
