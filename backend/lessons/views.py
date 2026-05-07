from rest_framework import viewsets, permissions, filters, status
from rest_framework.decorators import action
from django_filters.rest_framework import DjangoFilterBackend
from .models import Lesson, NewWord, Attachment, TeacherAvailability, TeacherBlockedDate, StudentRecurringSchedule
from .serializers import LessonSerializer, NewWordSerializer, AttachmentSerializer, TeacherAvailabilitySerializer, TeacherBlockedDateSerializer, StudentRecurringScheduleSerializer
from .permissions import IsStudentOrTeacher
from rest_framework.response import Response
from collections import defaultdict
from rest_framework.views import APIView
from django.utils import timezone
import datetime
from .scheduling import parse_lesson_datetime, validate_lesson_schedule, get_day_time_slots

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
    filterset_fields = ['teacher', 'student', 'status', 'level', 'is_template']
    ordering_fields = ['date', 'created_at']
    ordering = ['date']

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
        if lesson.is_template or not lesson.student or not lesson.teacher or not lesson.date:
            return Response({'error': 'Só é possível iniciar uma aula a partir de um evento agendado.'}, status=status.HTTP_400_BAD_REQUEST)
        if lesson.status not in ['scheduled', 'rescheduled', 'in_progress']:
            return Response({'error': 'Esta aula não está disponível para início.'}, status=status.HTTP_400_BAD_REQUEST)

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
        lesson = self.get_object()
        new_date_str = request.data.get('date')
        
        if not new_date_str:
            return Response({'error': 'A nova data e hora são obrigatórias.'}, status=status.HTTP_400_BAD_REQUEST)
            
        try:
            new_date = parse_lesson_datetime(new_date_str)
            validate_lesson_schedule(lesson.teacher, new_date, exclude_lesson_id=lesson.id)
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        lesson.date = new_date
        lesson.status = 'rescheduled'
        lesson.save()
        return Response(self.get_serializer(lesson).data)

    @action(detail=False, methods=['get'])
    def templates(self, request):
        qs = Lesson.objects.filter(is_template=True).order_by('level', 'title')
        serializer = self.get_serializer(qs, many=True)
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
            from django.db.models import Q
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
