from django.contrib.auth import get_user_model
from django.db.models import Count, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView
from lessons.models import Lesson
from .models import AIConversationMessage, AIStudyRecommendation, AIStudySession, SpeakingFeedback, WritingFeedback
from .permissions import CanAccessAIStudySession, CanAccessSpeakingFeedback, can_access_student
from .serializers import (
    AIConversationMessageSerializer,
    AIStudyRecommendationSerializer,
    AIStudySessionCreateSerializer,
    AIStudySessionDetailSerializer,
    AIStudySessionListSerializer,
    LessonContextOptionSerializer,
    RenameConversationSerializer,
    SetContextLessonsSerializer,
    SpeakingAudioUploadSerializer,
    SpeakingFeedbackSerializer,
    TextMessageSerializer,
)
from .services import AIStudyContextService, AIStudyOpenAIService, AIStudyWorkflowService


class AIStudySessionViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated, CanAccessAIStudySession]
    pagination_class = None

    def get_queryset(self):
        base_qs = AIStudySession.objects.select_related(
            'student',
            'lesson',
            'lesson__teacher',
        ).prefetch_related(
            'context_lessons__lesson__teacher',
        ).annotate(
            message_count=Count('messages', distinct=True),
        )

        if self.action in ['retrieve', 'history', 'audio', 'message', 'contexts']:
            base_qs = base_qs.prefetch_related(
                'messages__audio',
                'messages__feedback__reviews',
                'messages__feedback__audio',
                'messages__writing_feedback',
            )

        user = self.request.user
        if user.role == 'admin':
            qs = base_qs
        elif user.role == 'teacher':
            qs = base_qs.filter(student__lessons_attended__teacher=user).distinct()
        else:
            qs = base_qs.filter(student=user)

        search = self.request.query_params.get('search')
        if search:
            qs = qs.filter(
                Q(title__icontains=search) |
                Q(lesson__title__icontains=search) |
                Q(context_lessons__lesson__title__icontains=search)
            ).distinct()
        return qs.order_by('-last_interaction_at', '-created_at')

    def get_serializer_class(self):
        if self.action == 'list':
            return AIStudySessionListSerializer
        if self.action == 'create':
            return AIStudySessionCreateSerializer
        return AIStudySessionDetailSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        mode = serializer.validated_data.get('mode', 'review')
        lesson = None
        lesson_id = serializer.validated_data.get('lesson_id')
        if lesson_id:
            lesson = get_object_or_404(
                AIStudyContextService.accessible_lessons(request.user),
                id=lesson_id,
            )
        session = AIStudySession.objects.create(
            student=request.user,
            lesson=lesson,
            mode=mode,
            theme='minhas_aulas' if mode == 'review' else 'custom',
            title=AIStudyContextService.default_session_title(lesson) if lesson else AIStudyWorkflowService.default_title_for_mode(mode),
            title_source='auto',
            last_interaction_at=timezone.now(),
        )
        if lesson:
            AIStudyContextService.sync_session_lesson(session, lesson)
        AIConversationMessage.objects.create(**AIStudyWorkflowService.initial_message_payload(session, lesson))
        detail_serializer = AIStudySessionDetailSerializer(session, context={'request': request})
        return Response(detail_serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def contexts(self, request, pk=None):
        session = self.get_object()
        serializer = SetContextLessonsSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        lesson = get_object_or_404(
            AIStudyContextService.accessible_lessons(session.student),
            id=serializer.validated_data['selected_lesson_id'],
        )
        AIStudyContextService.sync_session_lesson(session, lesson)
        AIConversationMessage.objects.create(
            session=session,
            role='assistant',
            content_type='text',
            text=f"Aula atual atualizada para {lesson.title}. Vou continuar usando esse conteúdo como referência principal.",
            metadata={'lesson_changed': True},
        )
        return Response(AIStudySessionDetailSerializer(session, context={'request': request}).data)

    @action(detail=True, methods=['post'])
    def rename(self, request, pk=None):
        session = self.get_object()
        serializer = RenameConversationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        session.title = serializer.validated_data['title']
        session.title_source = 'manual'
        session.updated_at = timezone.now()
        session.save(update_fields=['title', 'title_source', 'updated_at'])
        return Response(AIStudySessionListSerializer(session, context={'request': request}).data)

    @action(detail=True, methods=['get'])
    def history(self, request, pk=None):
        session = self.get_object()
        messages = session.messages.select_related('audio', 'feedback__audio').order_by('created_at')
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
        user_message = session.messages.filter(audio=feedback.audio, role='user').select_related('audio', 'feedback__audio').last()
        assistant_message = session.messages.filter(feedback=feedback, role='assistant').select_related('feedback__audio').last()
        return Response({
            'feedback': SpeakingFeedbackSerializer(feedback, context={'request': request}).data,
            'user_message': AIConversationMessageSerializer(user_message, context={'request': request}).data if user_message else None,
            'assistant_message': AIConversationMessageSerializer(assistant_message, context={'request': request}).data if assistant_message else None,
            'session': AIStudySessionListSerializer(session, context={'request': request}).data,
        }, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def message(self, request, pk=None):
        session = self.get_object()
        serializer = TextMessageSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        text = serializer.validated_data.get('text', '').strip()
        if not text:
            return Response({'error': 'text is required.'}, status=status.HTTP_400_BAD_REQUEST)
        if session.mode == 'writing':
            user_message, assistant_message = AIStudyWorkflowService.handle_writing_submission(
                session,
                text=text,
                text_type=serializer.validated_data.get('text_type', 'free'),
            )
        else:
            user_message = AIConversationMessage.objects.create(session=session, role='user', content_type='text', text=text)
            ai_text = AIStudyOpenAIService.generate_chat_response(session, text)
            assistant_message = AIConversationMessage.objects.create(
                session=session,
                role='assistant',
                content_type='text',
                text=ai_text,
                metadata={'supports_streaming': True},
            )
            AIStudyContextService.touch_session(session)
            AIStudyOpenAIService.maybe_generate_session_title(session)
        return Response({
            'user_message': AIConversationMessageSerializer(user_message, context={'request': request}).data,
            'assistant_message': AIConversationMessageSerializer(assistant_message, context={'request': request}).data,
            'session': AIStudySessionListSerializer(session, context={'request': request}).data,
        })


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
        recent_lesson = qs.first()
        serializer = LessonContextOptionSerializer(
            qs[:100],
            many=True,
            context={'recent_lesson_id': recent_lesson.id if recent_lesson else None},
        )
        return Response(serializer.data)


class AIStudyRecommendationAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def _resolve_student(self, request, source):
        User = get_user_model()
        student_id = source.get('student') or source.get('student_id')
        if request.user.role == 'student':
            return request.user
        if not student_id:
            return None
        student = get_object_or_404(User, id=student_id, role='student')
        if not can_access_student(request.user, student):
            return None
        return student

    def get(self, request):
        student = self._resolve_student(request, request.query_params)
        if not student:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        recommendation = AIStudyRecommendation.objects.filter(student=student).select_related('teacher', 'lesson').first()
        if not recommendation:
            return Response(None, status=status.HTTP_200_OK)
        return Response(AIStudyRecommendationSerializer(recommendation, context={'request': request}).data)

    def post(self, request):
        if request.user.role not in ['teacher', 'admin']:
            return Response({'detail': 'You do not have permission to perform this action.'}, status=status.HTTP_403_FORBIDDEN)
        student = self._resolve_student(request, request.data)
        if not student:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        mode = request.data.get('mode')
        if mode not in ['review', 'speaking', 'writing']:
            return Response({'mode': 'Invalid mode.'}, status=status.HTTP_400_BAD_REQUEST)

        lesson = None
        lesson_id = request.data.get('lesson_id')
        if lesson_id:
            lesson = get_object_or_404(AIStudyContextService.accessible_lessons(request.user, student=student), id=lesson_id)
        elif mode == 'review':
            lesson = student.lessons_attended.order_by('-date', '-created_at').first()

        recommendation, _ = AIStudyRecommendation.objects.update_or_create(
            student=student,
            defaults={
                'teacher': request.user,
                'mode': mode,
                'lesson': lesson,
                'note': (request.data.get('note') or '').strip(),
            },
        )
        return Response(AIStudyRecommendationSerializer(recommendation, context={'request': request}).data)

    def delete(self, request):
        if request.user.role not in ['teacher', 'admin']:
            return Response({'detail': 'You do not have permission to perform this action.'}, status=status.HTTP_403_FORBIDDEN)
        student = self._resolve_student(request, request.query_params)
        if not student:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        AIStudyRecommendation.objects.filter(student=student).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class AIStudyProgressOverviewAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        User = get_user_model()
        student_id = request.query_params.get('student')
        if request.user.role == 'student':
            student = request.user
        elif student_id:
            student = get_object_or_404(User, id=student_id, role='student')
            if not can_access_student(request.user, student):
                return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        else:
            return Response({'detail': 'student is required.'}, status=status.HTTP_400_BAD_REQUEST)

        recommendation = AIStudyRecommendation.objects.filter(student=student).select_related('teacher', 'lesson').first()
        speaking_history = SpeakingFeedback.objects.filter(session__student=student).order_by('-created_at')[:8]
        writing_history = WritingFeedback.objects.filter(student=student).order_by('-created_at')[:8]

        return Response({
            'recommendation': AIStudyRecommendationSerializer(recommendation, context={'request': request}).data if recommendation else None,
            'speaking_history': [
                {
                    'id': str(item.id),
                    'created_at': item.created_at,
                    'overall_score': item.overall_score,
                    'estimated_level': item.estimated_level,
                    'problem_words': item.problem_words,
                }
                for item in speaking_history
            ],
            'writing_history': [
                {
                    'id': str(item.id),
                    'created_at': item.created_at,
                    'text_type': item.text_type,
                    'writing_score': item.writing_score,
                    'estimated_level': item.estimated_level,
                }
                for item in writing_history
            ],
        })
