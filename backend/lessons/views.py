from rest_framework import viewsets, permissions, filters, status, exceptions
from rest_framework.decorators import action
from django_filters.rest_framework import DjangoFilterBackend
from django.db.models import Max, Q
from .models import Lesson, NewWord, Attachment, TeacherAvailability, TeacherBlockedDate, StudentRecurringSchedule, Homework, HomeworkAnswer, HomeworkTemplate, VocabularyCard, VocabularyCategory, LessonSummary
from .serializers import LessonSerializer, NewWordSerializer, AttachmentSerializer, TeacherAvailabilitySerializer, TeacherBlockedDateSerializer, StudentRecurringScheduleSerializer, HomeworkSerializer, HomeworkAnswerSerializer, HomeworkTemplateSerializer, VocabularyCardSerializer, VocabularyCategorySerializer, VocabularyReviewLogSerializer, LessonSummarySerializer
from .permissions import IsStudentOrTeacher
from rest_framework.response import Response
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from collections import defaultdict
from rest_framework.views import APIView
from django.utils import timezone
import datetime
import json
from .scheduling import (
    insert_custom_lesson_into_student_sequence,
    parse_lesson_datetime,
    reorder_student_lessons as reorder_student_lessons_service,
    get_day_time_slots,
    swap_student_lesson_slot,
    validate_lesson_schedule,
)
from .vocabulary import (
    delete_new_word_cards,
    ensure_default_categories,
    notification_badges,
    review_queue,
    schedule_card,
    sync_new_word_card,
    vocabulary_stats,
)
from ai_study.services import LessonSummaryWorkflowService

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
            lesson = Lesson.objects.filter(id=lesson_id).first()
            if not lesson:
                raise exceptions.ValidationError({'lesson_id': 'Aula não encontrada.'})
            instance = serializer.save(lesson=lesson)
        else:
            instance = serializer.save()
        sync_new_word_card(
            instance,
            teacher=self.request.user if getattr(self.request.user, 'is_authenticated', False) else None,
        )

    def perform_update(self, serializer):
        instance = serializer.save()
        sync_new_word_card(
            instance,
            teacher=self.request.user if getattr(self.request.user, 'is_authenticated', False) else None,
        )

    def perform_destroy(self, instance):
        delete_new_word_cards(instance)
        super().perform_destroy(instance)

class LessonSummaryViewSet(viewsets.ModelViewSet):
    serializer_class = LessonSummarySerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['lesson', 'student', 'teacher']
    search_fields = ['summary', 'homework', 'observations', 'words__word', 'words__meaning', 'mistakes__mistake', 'mistakes__correction']
    ordering_fields = ['created_at', 'updated_at', 'lesson__date']
    ordering = ['-created_at']

    def get_queryset(self):
        user = self.request.user
        qs = LessonSummary.objects.select_related('lesson', 'student', 'teacher').prefetch_related(
            'words',
            'mistakes',
            'next_topics',
            'lesson__vocabulary_cards',
            'lesson__vocabulary_cards__student',
            'lesson__vocabulary_cards__teacher',
            'lesson__vocabulary_cards__lesson',
            'lesson__vocabulary_cards__category',
        )
        if user.role == 'admin':
            return qs
        if user.role == 'teacher':
            return qs.filter(teacher=user)
        return qs.filter(student=user)

    def update(self, request, *args, **kwargs):
        if request.user.role == 'student':
            raise exceptions.PermissionDenied('Alunos podem apenas visualizar resumos.')
        return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        if request.user.role == 'student':
            raise exceptions.PermissionDenied('Alunos podem apenas visualizar resumos.')
        return super().partial_update(request, *args, **kwargs)

class VocabularyCategoryViewSet(viewsets.ModelViewSet):
    serializer_class = VocabularyCategorySerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    search_fields = ['name', 'slug']

    def get_queryset(self):
        ensure_default_categories()
        user = self.request.user
        return VocabularyCategory.objects.filter(Q(is_default=True) | Q(owner=user)).order_by('-is_default', 'name')

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user, is_default=False)

class VocabularyCardViewSet(viewsets.ModelViewSet):
    serializer_class = VocabularyCardSerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['student', 'teacher', 'lesson', 'source_type', 'favorite', 'archived', 'mastered', 'difficulty_level', 'category']
    search_fields = ['word', 'translation', 'explanation', 'example_sentence', 'custom_category']
    ordering_fields = ['next_review_at', 'last_reviewed_at', 'created_at', 'word', 'confidence_level', 'failure_count']
    ordering = ['next_review_at']

    def get_queryset(self):
        user = self.request.user
        qs = VocabularyCard.objects.select_related('student', 'teacher', 'lesson', 'category', 'source_new_word')
        if user.role == 'admin':
            return qs
        if user.role == 'teacher':
            return qs.filter(Q(teacher=user) | Q(lesson__teacher=user))
        return qs.filter(student=user)

    def perform_create(self, serializer):
        user = self.request.user
        student = serializer.validated_data.get('student') or user
        teacher = serializer.validated_data.get('teacher')
        source_type = serializer.validated_data.get('source_type')
        if user.role == 'student':
            student = user
            source_type = 'student'
        elif user.role == 'teacher':
            teacher = teacher or user
            source_type = source_type or 'teacher'
        serializer.save(student=student, teacher=teacher, source_type=source_type or 'student', next_review_at=timezone.now())

    def perform_update(self, serializer):
        card = self.get_object()
        user = self.request.user
        if user.role == 'student' and card.source_type != 'student':
            allowed = {'favorite', 'archived'}
            changed = set(serializer.validated_data.keys())
            if changed - allowed:
                raise exceptions.PermissionDenied('Cards criados pelo professor só podem ser favoritados ou arquivados pelo aluno.')
        serializer.save()

    @action(detail=True, methods=['post'])
    def review(self, request, pk=None):
        card = self.get_object()
        rating = request.data.get('rating')
        if rating not in ['very_hard', 'hard', 'easy']:
            return Response({'error': 'Use rating: very_hard, hard ou easy.'}, status=status.HTTP_400_BAD_REQUEST)
        result = schedule_card(card, rating)
        return Response({
            'card': self.get_serializer(result.card).data,
            'log': VocabularyReviewLogSerializer(result.log).data,
            'stats': vocabulary_stats(result.card.student),
        })

    @action(detail=True, methods=['post'])
    def copy(self, request, pk=None):
        source = self.get_object()
        card = VocabularyCard.objects.create(
            student=request.user,
            teacher=source.teacher,
            lesson=source.lesson,
            source_new_word=source.source_new_word,
            source_type='student',
            word=source.word,
            translation=source.translation,
            explanation=source.explanation,
            example_sentence=source.example_sentence,
            pronunciation=source.pronunciation,
            tags=source.tags,
            category=source.category,
            custom_category=source.custom_category,
            audio_url=source.audio_url,
            next_review_at=timezone.now(),
        )
        return Response(self.get_serializer(card).data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['get'])
    def queue(self, request):
        limit = int(request.query_params.get('limit', 50))
        cards = review_queue(request.user, limit=min(limit, 100))
        return Response(self.get_serializer(cards, many=True).data)

    @action(detail=False, methods=['get'])
    def dashboard(self, request):
        return Response(vocabulary_stats(request.user))

    @action(detail=False, methods=['post'])
    def import_lesson_words(self, request):
        lesson_id = request.data.get('lesson')
        lesson = Lesson.objects.filter(id=lesson_id).prefetch_related('new_words').first()
        if not lesson:
            return Response({'error': 'Aula não encontrada.'}, status=status.HTTP_404_NOT_FOUND)
        student = lesson.student or request.user
        category, _ = VocabularyCategory.objects.get_or_create(
            owner=None,
            slug='vocabulary',
            defaults={'name': 'Vocabulary', 'is_default': True},
        )
        created = []
        for word in lesson.new_words.all():
            card, was_created = VocabularyCard.objects.get_or_create(
                student=student,
                source_new_word=word,
                defaults={
                    'teacher': lesson.teacher,
                    'lesson': lesson,
                    'source_type': 'lesson',
                    'word': word.word,
                    'translation': word.meaning,
                    'category': category,
                    'tags': [lesson.title],
                    'next_review_at': timezone.now(),
                },
            )
            if was_created:
                created.append(card)
        return Response(self.get_serializer(created, many=True).data, status=status.HTTP_201_CREATED)

class HomeworkViewSet(viewsets.ModelViewSet):
    serializer_class = HomeworkSerializer
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['teacher', 'student', 'lesson', 'status', 'classification']
    ordering_fields = ['due_date', 'created_at', 'updated_at']
    ordering = ['-created_at']

    def _prepare_request_data(self, request):
        if 'questions_payload' not in request.data:
            return request.data

        payload = {
            'title': request.data.get('title'),
            'description': request.data.get('description', ''),
            'classification': request.data.get('classification', ''),
            'status': request.data.get('status'),
            'due_date': request.data.get('due_date') or None,
            'teacher': request.data.get('teacher') or None,
            'student': request.data.get('student') or None,
            'lesson': request.data.get('lesson') or None,
            'template': request.data.get('template') or None,
        }
        try:
            questions = json.loads(request.data.get('questions_payload') or '[]')
        except json.JSONDecodeError:
            raise exceptions.ValidationError({'questions_payload': 'JSON inválido.'})

        if not isinstance(questions, list):
            raise exceptions.ValidationError({'questions_payload': 'Envie uma lista de perguntas.'})

        prepared_questions = []
        for index, question in enumerate(questions):
            if not isinstance(question, dict):
                raise exceptions.ValidationError({'questions_payload': 'Cada pergunta deve ser um objeto.'})
            item = dict(question)
            image_file = request.FILES.get(f'question_image_{index}')
            audio_file = request.FILES.get(f'question_audio_{index}')
            if image_file:
                item['image'] = image_file
            if audio_file:
                item['audio'] = audio_file
            prepared_questions.append(item)

        payload['questions'] = prepared_questions
        return payload

    def get_queryset(self):
        user = self.request.user
        qs = Homework.objects.select_related('teacher', 'student', 'lesson', 'template').prefetch_related('questions', 'answers')
        if user.role == 'admin':
            return qs
        if user.role == 'teacher':
            return qs.filter(teacher=user)
        return qs.filter(student=user).exclude(status='draft')

    def perform_create(self, serializer):
        serializer.save()

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=self._prepare_request_data(request))
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        headers = self.get_success_headers(serializer.data)
        return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=self._prepare_request_data(request), partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        return Response(serializer.data)

    def partial_update(self, request, *args, **kwargs):
        kwargs['partial'] = True
        return self.update(request, *args, **kwargs)

    @action(detail=True, methods=['post'])
    def duplicate(self, request, pk=None):
        source = self.get_object()
        payload = {
            'title': f"{source.title} (copia)",
            'description': source.description,
            'classification': source.classification,
            'status': 'draft',
            'due_date': source.due_date,
            'teacher': source.teacher_id,
            'student': source.student_id,
            'lesson': source.lesson_id,
            'template': source.template_id,
            'questions': [
                {
                    'type': question.type,
                    'prompt': question.prompt,
                    'image_path': question.image.name if question.image else '',
                    'image_url': question.image.url if question.image else '',
                    'audio_path': question.audio.name if question.audio else '',
                    'audio_url': question.audio.url if question.audio else '',
                    'audio_transcript': question.audio_transcript,
                    'options': question.options,
                    'correct_option_index': question.correct_option_index,
                    'order': question.order,
                }
                for question in source.questions.all()
            ],
        }
        serializer = self.get_serializer(data=payload)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def save_template(self, request, pk=None):
        homework = self.get_object()
        template = HomeworkTemplate.objects.create(
            title=homework.title,
            description=homework.description,
            classification=homework.classification,
            teacher=homework.teacher,
            source_homework=homework,
            questions=[
                {
                    'type': question.type,
                    'prompt': question.prompt,
                    'image_path': question.image.name if question.image else '',
                    'image_url': question.image.url if question.image else '',
                    'audio_path': question.audio.name if question.audio else '',
                    'audio_url': question.audio.url if question.audio else '',
                    'audio_transcript': question.audio_transcript,
                    'options': question.options,
                    'correct_option_index': question.correct_option_index,
                    'order': question.order,
                }
                for question in homework.questions.all()
            ],
        )
        return Response(HomeworkTemplateSerializer(template).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def submit_answers(self, request, pk=None):
        homework = self.get_object()
        answers = request.data.get('answers', [])
        student = homework.student or request.user
        for answer in answers:
            question = homework.questions.filter(id=answer.get('question')).first()
            if not question:
                continue
            HomeworkAnswer.objects.update_or_create(
                homework=homework,
                question=question,
                student=student,
                defaults={
                    'answer_text': answer.get('answer_text', ''),
                    'selected_option_index': answer.get('selected_option_index'),
                },
            )
        homework.status = 'sent'
        homework.save()
        return Response(self.get_serializer(homework).data)

class HomeworkAnswerViewSet(viewsets.ModelViewSet):
    serializer_class = HomeworkAnswerSerializer
    permission_classes = [permissions.IsAuthenticated]
    queryset = HomeworkAnswer.objects.select_related('homework', 'question', 'student')

    def get_queryset(self):
        user = self.request.user
        qs = super().get_queryset()
        if user.role == 'admin':
            return qs
        if user.role == 'teacher':
            return qs.filter(homework__teacher=user)
        return qs.filter(student=user)

class HomeworkTemplateViewSet(viewsets.ModelViewSet):
    serializer_class = HomeworkTemplateSerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['teacher', 'classification']
    ordering_fields = ['created_at', 'updated_at', 'title']
    ordering = ['-created_at']

    def get_queryset(self):
        user = self.request.user
        qs = HomeworkTemplate.objects.all()
        if user.role == 'admin':
            return qs
        return qs.filter(teacher=user)

class LessonViewSet(viewsets.ModelViewSet):
    serializer_class = LessonSerializer
    permission_classes = [permissions.AllowAny]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['teacher', 'student', 'status', 'level', 'is_template']
    ordering_fields = ['date', 'created_at', 'order']
    ordering = ['date']

    def _ensure_teacher_lesson_access(self, lesson):
        user = self.request.user
        if not getattr(user, 'is_authenticated', False):
            raise exceptions.NotAuthenticated()
        if user.role == 'admin':
            return
        if user.role != 'teacher' or lesson.teacher_id != user.id:
            raise exceptions.PermissionDenied('Somente o professor responsável pode alterar esta aula.')

    def _ensure_teacher_student_scope(self, student_id):
        user = self.request.user
        if not getattr(user, 'is_authenticated', False):
            raise exceptions.NotAuthenticated()
        if user.role == 'admin':
            return
        if user.role != 'teacher':
            raise exceptions.PermissionDenied('Somente professores podem alterar a trilha do aluno.')
        if not Lesson.objects.filter(student_id=student_id, teacher=user, is_template=False).exists():
            raise exceptions.PermissionDenied('Você não tem acesso à trilha deste aluno.')

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        
        if request.query_params.get('all') == 'true':
            serializer = self.get_serializer(queryset, many=True)
            return Response(serializer.data)

        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['patch'])
    def start_lesson(self, request, pk=None):
        lesson = self.get_object()
        self._ensure_teacher_lesson_access(lesson)
        if lesson.is_template or not lesson.student or not lesson.teacher or not lesson.date:
            return Response({'error': 'Só é possível iniciar uma aula a partir de um evento agendado.'}, status=status.HTTP_400_BAD_REQUEST)
        if lesson.status not in ['scheduled', 'rescheduled', 'in_progress']:
            return Response({'error': 'Esta aula não está disponível para início.'}, status=status.HTTP_400_BAD_REQUEST)

        custom_lesson_title = (request.data.get('custom_lesson_title') or '').strip()
        selected_lesson_id = request.data.get('selected_lesson')
        if custom_lesson_title and selected_lesson_id:
            return Response({'error': 'Escolha uma aula da trilha ou crie uma nova, mas não envie os dois ao mesmo tempo.'}, status=status.HTTP_400_BAD_REQUEST)

        if custom_lesson_title:
            try:
                active_lesson = insert_custom_lesson_into_student_sequence(lesson, custom_lesson_title)
            except ValueError as exc:
                return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
            return Response(self.get_serializer(active_lesson).data)

        if selected_lesson_id:
            selected_lesson = Lesson.objects.filter(id=selected_lesson_id, is_template=False).first()
            if not selected_lesson:
                return Response({'error': 'Aula da trilha inválida.'}, status=status.HTTP_400_BAD_REQUEST)
            if selected_lesson.student_id != lesson.student_id:
                return Response({'error': 'A aula escolhida não pertence à trilha deste aluno.'}, status=status.HTTP_400_BAD_REQUEST)
            if selected_lesson.teacher_id not in [None, lesson.teacher_id]:
                return Response({'error': 'A aula escolhida está vinculada a outro professor.'}, status=status.HTTP_400_BAD_REQUEST)
            if selected_lesson.status in ['completed', 'canceled', 'missed']:
                return Response({'error': 'A aula escolhida já foi encerrada e não pode ser iniciada novamente.'}, status=status.HTTP_400_BAD_REQUEST)

            active_lesson = selected_lesson
            if selected_lesson.id != lesson.id:
                try:
                    active_lesson = swap_student_lesson_slot(lesson, selected_lesson)
                except ValueError as exc:
                    return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

            active_lesson.status = 'in_progress'
            active_lesson.save()
            return Response(self.get_serializer(active_lesson).data)

        template_id = request.data.get('template') or lesson.template_id
        if not template_id:
            return Response({'error': 'Selecione um template para iniciar a aula.'}, status=status.HTTP_400_BAD_REQUEST)

        template = Lesson.objects.filter(id=template_id, is_template=True).first()
        if not template:
            return Response({'error': 'Template inválido.'}, status=status.HTTP_400_BAD_REQUEST)

        student_levels = ['A1', 'A2', 'A1/A2', 'ALL LEVELS'] if lesson.student.level == 'A1/A2' else [lesson.student.level, 'ALL LEVELS']
        if template.level not in student_levels:
            return Response({'error': 'O template selecionado não pertence ao nível do aluno.'}, status=status.HTTP_400_BAD_REQUEST)

        lesson.template = template
        lesson.title = template.title
        lesson.level = template.level
        lesson.status = 'in_progress'
        lesson.save()
        return Response(self.get_serializer(lesson).data)

    @action(detail=True, methods=['patch'])
    def complete_lesson(self, request, pk=None):
        lesson = self.get_object()
        self._ensure_teacher_lesson_access(lesson)
        if lesson.is_template:
            return Response({'error': 'Templates não podem ser concluídos.'}, status=status.HTTP_400_BAD_REQUEST)

        lesson.status = 'completed'
        lesson.save(update_fields=['status', 'updated_at'])
        return Response(self.get_serializer(lesson).data)

    @action(detail=True, methods=['post'], url_path='generate-summary')
    def generate_summary(self, request, pk=None):
        lesson = self.get_object()
        user = request.user
        if not getattr(user, 'is_authenticated', False):
            raise exceptions.NotAuthenticated()
        if user.role == 'student':
            raise exceptions.PermissionDenied('Alunos podem apenas visualizar resumos.')
        if user.role == 'teacher' and lesson.teacher_id != user.id:
            raise exceptions.PermissionDenied('Somente o professor da aula pode gerar o resumo.')
        try:
            summary = LessonSummaryWorkflowService.create_or_update_from_ai(lesson, user, request.data)
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        serializer = LessonSummarySerializer(summary, context={'request': request})
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['patch'])
    def mark_missed(self, request, pk=None):
        lesson = self.get_object()
        if not lesson.date or lesson.date >= timezone.now():
            return Response({'error': 'Não é possível marcar falta antes do horário da aula.'}, status=status.HTTP_400_BAD_REQUEST)
        lesson.status = 'missed'
        lesson.save()
        return Response(self.get_serializer(lesson).data)

    @action(detail=True, methods=['patch'])
    def cancel_lesson(self, request, pk=None):
        lesson = self.get_object()
        lesson.status = 'canceled'
        lesson.save()
        return Response(self.get_serializer(lesson).data)

    @action(detail=True, methods=['patch'])
    def reschedule(self, request, pk=None):
        user = request.user
        if not getattr(user, 'is_authenticated', False):
            raise exceptions.NotAuthenticated()

        lesson = self.get_object()
        new_date_str = request.data.get('date')

        if lesson.is_template or not lesson.teacher or not lesson.student:
            return Response({'error': 'Só é possível reagendar uma aula agendada.'}, status=status.HTTP_400_BAD_REQUEST)

        if user.role == 'student':
            raise exceptions.PermissionDenied('Somente professores podem reagendar aulas.')
        if user.role == 'teacher' and lesson.teacher_id != user.id:
            raise exceptions.PermissionDenied('Professores podem reagendar apenas as próprias aulas.')
        if user.role not in ['admin', 'teacher']:
            raise exceptions.PermissionDenied('Você não tem permissão para reagendar aulas.')

        if lesson.status not in ['scheduled', 'rescheduled']:
            return Response({'error': 'Só é possível reagendar aulas que ainda estão agendadas.'}, status=status.HTTP_400_BAD_REQUEST)

        if not lesson.date or lesson.date <= timezone.now():
            return Response({'error': 'Não é possível reagendar uma aula que já passou.'}, status=status.HTTP_400_BAD_REQUEST)
        
        if not new_date_str:
            return Response({'error': 'A nova data e hora são obrigatórias.'}, status=status.HTTP_400_BAD_REQUEST)
            
        try:
            new_date = parse_lesson_datetime(new_date_str)
            validate_lesson_schedule(lesson.teacher, new_date, exclude_lesson_id=lesson.id)
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        lesson.date = new_date
        lesson.status = 'rescheduled'
        lesson.save(update_fields=['date', 'status', 'updated_at'])
        return Response(self.get_serializer(lesson).data)

    @action(detail=False, methods=['get'])
    def templates(self, request):
        qs = Lesson.objects.filter(is_template=True).order_by('level', 'title')
        serializer = self.get_serializer(qs, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['patch'])
    def reorder_student_lessons(self, request):
        student_id = request.data.get('student')
        lesson_ids = request.data.get('lesson_ids') or []

        if not student_id:
            return Response({'error': 'Aluno obrigatório.'}, status=status.HTTP_400_BAD_REQUEST)
        if not isinstance(lesson_ids, list) or not lesson_ids:
            return Response({'error': 'Envie a nova ordem das aulas futuras.'}, status=status.HTTP_400_BAD_REQUEST)

        self._ensure_teacher_student_scope(student_id)

        from django.contrib.auth import get_user_model
        student = get_user_model().objects.filter(id=student_id).first()
        if not student:
            return Response({'error': 'Aluno não encontrado.'}, status=status.HTTP_404_NOT_FOUND)

        try:
            reordered = reorder_student_lessons_service(
                student,
                lesson_ids,
                teacher=self.request.user if self.request.user.role == 'teacher' else None,
            )
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        serializer = self.get_serializer(reordered, many=True)
        return Response(serializer.data)

    def create(self, request, *args, **kwargs):
        student_id = request.data.get('student')
        template_id = request.data.get('template')
        if not template_id:
            return Response({'error': 'A aula deve estar vinculada a um template.'}, status=status.HTTP_400_BAD_REQUEST)

        template = Lesson.objects.filter(id=template_id, is_template=True).first()
        if not template:
            return Response({'error': 'Template inválido.'}, status=status.HTTP_400_BAD_REQUEST)

        mutable_data = request.data.copy()
        mutable_data['title'] = template.title
        mutable_data['level'] = template.level
        mutable_data['template'] = str(template.id)

        if student_id:
            from django.contrib.auth import get_user_model
            student = get_user_model().objects.filter(id=student_id).first()
            student_levels = ['A1', 'A2', 'A1/A2', 'ALL LEVELS'] if getattr(student, 'level', None) == 'A1/A2' else [getattr(student, 'level', None), 'ALL LEVELS']
            if template.level not in student_levels:
                return Response({'error': 'O template selecionado não pertence ao nível do aluno.'}, status=status.HTTP_400_BAD_REQUEST)
        
        # If trying to schedule a lesson, check if a pending template already exists for this student
        if student_id and mutable_data.get('status') == 'scheduled':
            pending_lesson = Lesson.objects.filter(student_id=student_id, template=template, status='pending').first()
            if pending_lesson:
                # Update the pending lesson instead of creating a duplicate
                teacher = pending_lesson.teacher
                if not teacher and mutable_data.get('teacher'):
                    from django.contrib.auth import get_user_model
                    teacher = get_user_model().objects.filter(id=mutable_data.get('teacher')).first()
                try:
                    validate_lesson_schedule(
                        teacher,
                        parse_lesson_datetime(mutable_data.get('date')),
                        exclude_lesson_id=pending_lesson.id,
                    )
                except ValueError as exc:
                    return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
                serializer = self.get_serializer(pending_lesson, data=mutable_data, partial=True)
                serializer.is_valid(raise_exception=True)
                self.perform_update(serializer)
                return Response(serializer.data)

        if student_id and not mutable_data.get('order'):
            max_order = Lesson.objects.filter(student_id=student_id, is_template=False).aggregate(value=Max('order'))['value'] or 0
            mutable_data['order'] = max_order + 1

        serializer = self.get_serializer(data=mutable_data)
        serializer.is_valid(raise_exception=True)
        try:
            validate_lesson_schedule(
                serializer.validated_data.get('teacher'),
                serializer.validated_data.get('date'),
            )
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        self.perform_create(serializer)
        headers = self.get_success_headers(serializer.data)
        return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)

    def partial_update(self, request, *args, **kwargs):
        lesson = self.get_object()
        date_value = request.data.get('date')
        teacher_value = request.data.get('teacher')
        status_value = request.data.get('status', lesson.status)
        if date_value and status_value in ['scheduled', 'rescheduled', 'in_progress']:
            teacher = lesson.teacher
            if teacher_value:
                from django.contrib.auth import get_user_model
                teacher = get_user_model().objects.filter(id=teacher_value).first()
            try:
                validate_lesson_schedule(teacher, parse_lesson_datetime(date_value), exclude_lesson_id=lesson.id)
            except ValueError as exc:
                return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return super().partial_update(request, *args, **kwargs)

    def get_queryset(self):
        user = self.request.user
        qs = Lesson.objects.all().select_related('teacher', 'student', 'template', 'summary').prefetch_related('new_words', 'attachments')
        
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
                return qs.filter(Q(teacher=user) | Q(is_template=True))
            return qs.filter(student=user)
        return qs

    def perform_create(self, serializer):
        # Temporarily disabled auth check for testing
        serializer.save()

class TeacherAvailabilityAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, teacher_id):
        # 1. Pega disponibilidades gerais do professor (Dias da semana X Horarios)
        availabilities = TeacherAvailability.objects.filter(teacher_id=teacher_id)
        
        # 2. Pega aulas ja agendadas (para subtrair horários que já estao ocupados futuramente)
        upcoming_lessons = Lesson.objects.filter(
            teacher_id=teacher_id, 
            date__gte=timezone.now(),
            status__in=['scheduled', 'rescheduled', 'in_progress']
        )

        # 3. Pega datas bloqueadas
        blocked_dates = TeacherBlockedDate.objects.filter(
            teacher_id=teacher_id,
            date__gte=timezone.now().date()
        )
        
        # Converter para formato amigavel pro front
        slots = []
        for av in availabilities:
            slots.append({
                'day_of_week': av.day_of_week,
                'start': av.start_time.strftime('%H:%M:%S'),
                'end': av.end_time.strftime('%H:%M:%S')
            })
            
        busy = []
        for l in upcoming_lessons:
            # Mandamos formato full
            busy.append(l.date.isoformat())

        blocked = [bd.date.isoformat() for bd in blocked_dates]
        recurring_busy = [
            {
                'day_of_week': schedule.day_of_week,
                'start_time': schedule.start_time.strftime('%H:%M'),
                'student': schedule.student_id,
                'student_name': getattr(schedule.student, 'name', ''),
            }
            for schedule in StudentRecurringSchedule.objects.filter(
                teacher_id=teacher_id,
                active=True,
            ).select_related('student')
        ]

        date_param = request.query_params.get('date')
        exclude_lesson_id = request.query_params.get('exclude_lesson')
        time_slots = None
        if date_param:
            try:
                time_slots = get_day_time_slots(teacher_id, date_param, exclude_lesson_id=exclude_lesson_id)
            except ValueError:
                return Response({'error': 'Data inválida.'}, status=status.HTTP_400_BAD_REQUEST)
            
        return Response({
            'slots': slots,
            'busy': busy,
            'blocked': blocked,
            'recurring_busy': recurring_busy,
            'time_slots': time_slots,
        })

    def post(self, request, teacher_id):
        # Atualizar disponibilidade
        if request.user.id != teacher_id and request.user.role != 'admin':
             return Response({'error': 'Unauthorized'}, status=status.HTTP_403_FORBIDDEN)
        
        slots = request.data.get('slots', [])
        
        new_availabilities = []
        seen_ranges = []
        for slot in slots:
            start_time = datetime.time.fromisoformat(slot['start'])
            end_time = datetime.time.fromisoformat(slot['end'])
            if start_time >= end_time:
                return Response({'error': 'O horário inicial deve ser menor que o final.'}, status=status.HTTP_400_BAD_REQUEST)
            for existing in seen_ranges:
                if existing['day_of_week'] == slot['day_of_week'] and start_time < existing['end'] and existing['start'] < end_time:
                    return Response({'error': 'Existem faixas de disponibilidade sobrepostas.'}, status=status.HTTP_400_BAD_REQUEST)
            seen_ranges.append({'day_of_week': slot['day_of_week'], 'start': start_time, 'end': end_time})
            new_availabilities.append(TeacherAvailability(
                teacher_id=teacher_id,
                day_of_week=slot['day_of_week'],
                start_time=start_time,
                end_time=end_time
            ))
            
        TeacherAvailability.objects.filter(teacher_id=teacher_id).delete()
        TeacherAvailability.objects.bulk_create(new_availabilities)
        return Response({'status': 'Availabilities updated'})

class SidebarBadgesAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        if request.user.role != 'student':
            return Response({
                'homework': {'count': 0, 'pending_homework': 0, 'overdue_reviews': 0, 'difficult_cards': 0, 'state': 'none'},
                'finance': {'count': 0, 'state': 'none'},
            })
        return Response(notification_badges(request.user))

class StudentLessonSummariesAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, student_id):
        user = request.user
        if user.role == 'student' and str(user.id) != str(student_id):
            raise exceptions.PermissionDenied('Alunos podem visualizar apenas o próprio histórico.')
        qs = LessonSummary.objects.filter(student_id=student_id).select_related('lesson', 'student', 'teacher').prefetch_related(
            'words',
            'mistakes',
            'next_topics',
            'lesson__vocabulary_cards',
            'lesson__vocabulary_cards__category',
        )
        if user.role == 'teacher':
            qs = qs.filter(teacher=user)
        if user.role not in ['admin', 'teacher', 'student']:
            qs = qs.none()

        search = request.query_params.get('search')
        date_from = request.query_params.get('date_from')
        date_to = request.query_params.get('date_to')
        if search:
            qs = qs.filter(
                Q(summary__icontains=search) |
                Q(homework__icontains=search) |
                Q(observations__icontains=search) |
                Q(words__word__icontains=search) |
                Q(mistakes__mistake__icontains=search) |
                Q(next_topics__topic__icontains=search)
            ).distinct()
        if date_from:
            qs = qs.filter(lesson__date__date__gte=date_from)
        if date_to:
            qs = qs.filter(lesson__date__date__lte=date_to)
        qs = qs.order_by('-lesson__date', '-created_at')
        paginator = self.pagination_class() if hasattr(self, 'pagination_class') else None
        from rest_framework.pagination import PageNumberPagination
        paginator = paginator or PageNumberPagination()
        page = paginator.paginate_queryset(qs, request, view=self)
        serializer = LessonSummarySerializer(page, many=True, context={'request': request})
        return paginator.get_paginated_response(serializer.data)

class TeacherBlockedDateViewSet(viewsets.ModelViewSet):
    serializer_class = TeacherBlockedDateSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.role == 'admin':
            return TeacherBlockedDate.objects.all()
        return TeacherBlockedDate.objects.filter(teacher=user)

    def create(self, request, *args, **kwargs):
        # block date
        date_str = request.data.get('date')
        if not date_str:
            return Response({'error': 'Data obrigatória'}, status=status.HTTP_400_BAD_REQUEST)
            
        # check if already blocked
        if TeacherBlockedDate.objects.filter(teacher=request.user, date=date_str).exists():
             return Response({'status': 'Data já bloqueada'})
             
        TeacherBlockedDate.objects.create(
            teacher=request.user,
            date=date_str
        )
        return Response({'status': 'Data bloqueada'}, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['delete'])
    def unblock(self, request):
        date_str = request.data.get('date')
        if not date_str:
            return Response({'error': 'Data obrigatória'}, status=status.HTTP_400_BAD_REQUEST)
            
        deleted, _ = TeacherBlockedDate.objects.filter(teacher=request.user, date=date_str).delete()
        if deleted:
            return Response({'status': 'Data desbloqueada'})
        return Response({'error': 'Data não estava bloqueada'}, status=status.HTTP_404_NOT_FOUND)

class StudentRecurringScheduleViewSet(viewsets.ModelViewSet):
    serializer_class = StudentRecurringScheduleSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        qs = StudentRecurringSchedule.objects.filter(active=True)
        if user.role == 'admin':
            return qs
        if user.role == 'teacher':
            return qs.filter(teacher=user)
        return qs.filter(student=user)

class CalendarAPIView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request, format=None):
        qs = Lesson.objects.exclude(status='pending')
        user = request.user
        if getattr(user, 'is_authenticated', False):
            if user.role == 'teacher':
                qs = qs.filter(teacher=user)
            elif user.role == 'student':
                qs = qs.filter(student=user)
            
        data = defaultdict(list)
        for lesson in qs:
            if lesson.date:
                date_str = lesson.date.strftime('%Y-%m-%d')
                data[date_str].append({
                    'id': lesson.id,
                    'title': lesson.title,
                    'status': lesson.status,
                    'level': lesson.level,
                    'time': lesson.date.strftime('%H:%M:%S')
                })
            
        return Response(data)
