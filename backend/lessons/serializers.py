from rest_framework import serializers
from bps_core.media import signed_media_url, refresh_embedded_images
import mimetypes
from .models import (
    Lesson,
    NewWord,
    Attachment,
    TeacherAvailability,
    TeacherBlockedDate,
    StudentRecurringSchedule,
    Homework,
    HomeworkQuestion,
    HomeworkAnswer,
    HomeworkTemplate,
    VocabularyCard,
    VocabularyCategory,
    VocabularyReviewLog,
    LessonSummary,
    LessonSummaryWord,
    LessonSummaryMistake,
    LessonSummaryNextTopic,
)
from .scheduling import lesson_end_time, lesson_start_times_overlap
from .word_sentences import WORD_SENTENCE_BATCH_LIMIT
from accounts.access import is_admin, managed_students


def validate_managed_targets(attrs, user):
    if is_admin(user):
        return
    teacher = attrs.get('teacher')
    student = attrs.get('student')
    group = attrs.get('group')
    lesson = attrs.get('lesson')
    if teacher and teacher.pk != user.pk:
        raise serializers.ValidationError({'teacher': 'Use seu próprio vínculo de professor.'})
    if student and not managed_students(user).filter(pk=student.pk).exists():
        raise serializers.ValidationError({'student': 'Aluno fora do seu vínculo.'})
    if group and group.teacher_id != user.pk:
        raise serializers.ValidationError({'group': 'Grupo fora do seu vínculo.'})
    if lesson and lesson.teacher_id != user.pk:
        raise serializers.ValidationError({'lesson': 'Aula fora do seu vínculo.'})


def can_reuse_material_path(user, path, kind):
    if not path or not isinstance(path, str) or not path.startswith(f'homework/questions/{"images" if kind == "image" else "audio"}/'):
        return False
    questions = HomeworkQuestion.objects.filter(**{kind: path})
    if not is_admin(user):
        questions = questions.filter(homework__teacher=user)
    if questions.exists():
        return True
    templates = HomeworkTemplate.objects.all()
    if not is_admin(user):
        templates = templates.filter(teacher=user)
    return any(
        any(question.get(f'{kind}_path') == path for question in (items or []) if isinstance(question, dict))
        for items in templates.values_list('questions', flat=True)
    )

class StudentRecurringScheduleSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source='student.name', read_only=True)
    group_name = serializers.CharField(source='group.name', read_only=True)
    teacher_name = serializers.CharField(source='teacher.name', read_only=True)

    class Meta:
        model = StudentRecurringSchedule
        fields = [
            'id', 'student', 'student_name', 'group', 'group_name',
            'teacher', 'teacher_name', 'day_of_week', 'start_time', 'active',
        ]

    def validate(self, attrs):
        validated = super().validate(attrs)
        request = self.context.get('request')
        if request:
            if not is_admin(request.user) and request.user.role != 'teacher':
                raise serializers.ValidationError('Somente a escola pode alterar agendas.')
            validate_managed_targets(validated, request.user)
        teacher = validated.get('teacher', getattr(self.instance, 'teacher', None))
        student = validated.get('student', getattr(self.instance, 'student', None))
        group = validated.get('group', getattr(self.instance, 'group', None))
        day_of_week = validated.get('day_of_week', getattr(self.instance, 'day_of_week', None))
        start_time = validated.get('start_time', getattr(self.instance, 'start_time', None))
        active = validated.get('active', getattr(self.instance, 'active', True))

        if not active or teacher is None or day_of_week is None or start_time is None:
            return validated

        end_time, crosses_day = lesson_end_time(start_time)
        if crosses_day:
            raise serializers.ValidationError({
                'start_time': 'A aula recorrente precisa terminar no mesmo dia.',
            })

        has_availability = TeacherAvailability.objects.filter(
            teacher=teacher,
            day_of_week=day_of_week,
            start_time__lte=start_time,
            end_time__gte=end_time,
        ).exists()
        if not has_availability:
            raise serializers.ValidationError({
                'start_time': 'O horário precisa caber dentro da disponibilidade do professor.',
            })

        conflicting_schedules = StudentRecurringSchedule.objects.filter(
            teacher=teacher,
            day_of_week=day_of_week,
            active=True,
        )
        if self.instance:
            conflicting_schedules = conflicting_schedules.exclude(pk=self.instance.pk)
        if group:
            conflicting_schedules = conflicting_schedules.exclude(group=group)
        elif student:
            conflicting_schedules = conflicting_schedules.exclude(student=student)

        for schedule in conflicting_schedules:
            if lesson_start_times_overlap(schedule.start_time, start_time):
                conflict_end_time, _ = lesson_end_time(schedule.start_time)
                raise serializers.ValidationError({
                    'start_time': (
                        f'Esse horário se sobrepõe a outra aula recorrente do professor '
                        f'({schedule.start_time.strftime("%H:%M")} - {conflict_end_time.strftime("%H:%M")}).'
                    ),
                })

        return validated

class TeacherAvailabilitySerializer(serializers.ModelSerializer):
    class Meta:
        model = TeacherAvailability
        fields = ['id', 'teacher', 'day_of_week', 'start_time', 'end_time']

class TeacherBlockedDateSerializer(serializers.ModelSerializer):
    class Meta:
        model = TeacherBlockedDate
        fields = ['id', 'teacher', 'date', 'reason']
        read_only_fields = ['teacher']

class NewWordSerializer(serializers.ModelSerializer):
    class Meta:
        model = NewWord
        fields = ['id', 'word', 'meaning', 'level', 'status']


class GenerateWordSentencesSerializer(serializers.Serializer):
    words = serializers.ListField(
        child=serializers.CharField(max_length=100),
        min_length=1,
        max_length=WORD_SENTENCE_BATCH_LIMIT,
    )

    def validate_words(self, words):
        seen = set()
        unique_words = []
        for word in words:
            normalized = word.casefold()
            if normalized not in seen:
                seen.add(normalized)
                unique_words.append(word)
        return unique_words


class GenerateVocabularySentencesSerializer(GenerateWordSentencesSerializer):
    student_id = serializers.UUIDField(required=False)


class WordSentenceDraftSerializer(serializers.Serializer):
    source_word = serializers.CharField(max_length=100)
    sentence = serializers.CharField(max_length=255)
    translation = serializers.CharField(max_length=2000)


class GenerateSingleWordSentenceSerializer(serializers.Serializer):
    source_word = serializers.CharField(max_length=100)
    adjustment = serializers.ChoiceField(choices=['standard', 'easier', 'harder'], default='standard')
    previous_sentence = serializers.CharField(max_length=255, required=False, allow_blank=True)
    student_id = serializers.UUIDField(required=False)

    def validate(self, attrs):
        if attrs['adjustment'] != 'standard' and not attrs.get('previous_sentence'):
            raise serializers.ValidationError({'previous_sentence': 'Envie a frase atual para ajustar a dificuldade.'})
        return attrs


class SaveWordSentenceSerializer(WordSentenceDraftSerializer):
    student_id = serializers.UUIDField(required=False)

    def validate(self, attrs):
        from .word_sentences import contains_source_word
        if not contains_source_word(attrs['sentence'], attrs['source_word']):
            raise serializers.ValidationError({'sentence': 'A frase precisa manter a palavra original.'})
        return attrs


class ApproveWordSentencesSerializer(serializers.Serializer):
    items = WordSentenceDraftSerializer(many=True, min_length=1, max_length=WORD_SENTENCE_BATCH_LIMIT)


class SaveVocabularySentencesSerializer(ApproveWordSentencesSerializer):
    student_id = serializers.UUIDField(required=False)


class VocabularyCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = VocabularyCategory
        fields = ['id', 'name', 'slug', 'owner', 'is_default', 'created_at']
        read_only_fields = ['owner', 'is_default', 'created_at']

class VocabularyCardSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source='category.name', read_only=True)
    teacher_name = serializers.CharField(source='teacher.name', read_only=True)
    lesson_title = serializers.CharField(source='lesson.title', read_only=True)
    audio_file_url = serializers.FileField(source='audio', read_only=True)

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data['audio_url'] = signed_media_url(data['audio_url'])
        return data

    class Meta:
        model = VocabularyCard
        fields = [
            'id', 'student', 'teacher', 'teacher_name', 'lesson', 'lesson_title',
            'source_new_word', 'source_type', 'word', 'translation', 'explanation',
            'example_sentence', 'pronunciation', 'tags', 'category', 'category_name',
            'custom_category', 'audio', 'audio_file_url', 'audio_url', 'favorite',
            'archived', 'mastered', 'easiness_factor', 'interval_days',
            'repetition_count', 'failure_count', 'confidence_level',
            'difficulty_level', 'last_reviewed_at', 'next_review_at', 'created_at',
            'updated_at',
        ]
        read_only_fields = [
            'easiness_factor', 'interval_days', 'repetition_count', 'failure_count',
            'confidence_level', 'difficulty_level', 'last_reviewed_at',
            'next_review_at', 'mastered', 'created_at', 'updated_at', 'audio_url',
        ]
        extra_kwargs = {
            'student': {'required': False},
            'teacher': {'required': False},
            'source_type': {'required': False},
        }

    def validate_tags(self, value):
        if isinstance(value, str):
            return [tag.strip() for tag in value.split(',') if tag.strip()]
        return value or []

    def validate(self, attrs):
        attrs = super().validate(attrs)
        request = self.context.get('request')
        if not request or is_admin(request.user):
            return attrs
        user = request.user
        if user.role == 'student':
            if attrs.get('student') and attrs['student'].pk != user.pk:
                raise serializers.ValidationError({'student': 'Use sua própria conta.'})
            if attrs.get('teacher'):
                raise serializers.ValidationError({'teacher': 'Este vínculo é gerenciado pela escola.'})
            if self.instance and any(key in attrs for key in ['source_new_word', 'source_type', 'lesson']):
                raise serializers.ValidationError('Os vínculos do card não podem ser alterados.')
        elif user.role == 'teacher':
            validate_managed_targets(attrs, user)
        if attrs.get('lesson'):
            from .permissions import visible_lessons
            if not visible_lessons(user).filter(pk=attrs['lesson'].pk).exists():
                raise serializers.ValidationError({'lesson': 'Aula fora do seu vínculo.'})
        if attrs.get('source_new_word'):
            from .permissions import visible_lessons
            if not visible_lessons(user).filter(pk=attrs['source_new_word'].lesson_id).exists():
                raise serializers.ValidationError({'source_new_word': 'Palavra fora do seu vínculo.'})
        category = attrs.get('category')
        owner_ids = {user.pk, getattr(attrs.get('student'), 'pk', None)}
        if category and not category.is_default and category.owner_id not in owner_ids:
            raise serializers.ValidationError({'category': 'Categoria fora do seu vínculo.'})
        return attrs

class VocabularyReviewLogSerializer(serializers.ModelSerializer):
    word = serializers.CharField(source='card.word', read_only=True)

    class Meta:
        model = VocabularyReviewLog
        fields = [
            'id', 'card', 'word', 'student', 'rating', 'review_quality',
            'previous_easiness_factor', 'new_easiness_factor',
            'previous_interval_days', 'new_interval_days',
            'previous_repetition_count', 'new_repetition_count',
            'reviewed_at', 'next_review_at',
        ]
        read_only_fields = fields

class LessonSummaryWordSerializer(serializers.ModelSerializer):
    class Meta:
        model = LessonSummaryWord
        fields = ['id', 'word', 'meaning']
        read_only_fields = ['id']

class LessonSummaryMistakeSerializer(serializers.ModelSerializer):
    class Meta:
        model = LessonSummaryMistake
        fields = ['id', 'mistake', 'correction']
        read_only_fields = ['id']

class LessonSummaryNextTopicSerializer(serializers.ModelSerializer):
    class Meta:
        model = LessonSummaryNextTopic
        fields = ['id', 'topic']
        read_only_fields = ['id']

class LessonSummarySerializer(serializers.ModelSerializer):
    words = LessonSummaryWordSerializer(many=True, required=False)
    mistakes = LessonSummaryMistakeSerializer(many=True, required=False)
    next_topics = LessonSummaryNextTopicSerializer(many=True, required=False)
    flashcards = VocabularyCardSerializer(source='lesson.vocabulary_cards', many=True, read_only=True)
    lesson_title = serializers.CharField(source='lesson.title', read_only=True)
    lesson_date = serializers.DateTimeField(source='lesson.date', read_only=True)
    student_name = serializers.CharField(source='student.name', read_only=True)
    teacher_name = serializers.CharField(source='teacher.name', read_only=True)

    def to_representation(self, instance):
        data = super().to_representation(instance)
        files = [attachment.file for attachment in instance.lesson.attachments.all()]
        for field in ['summary', 'homework', 'observations']:
            data[field] = refresh_embedded_images(data[field], files, self.context.get('request'))
        return data

    class Meta:
        model = LessonSummary
        fields = [
            'id', 'lesson', 'lesson_title', 'lesson_date', 'student', 'student_name',
            'teacher', 'teacher_name', 'summary', 'homework', 'observations',
            'words', 'mistakes', 'next_topics', 'flashcards', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'lesson', 'student', 'teacher', 'created_at', 'updated_at']

    def update(self, instance, validated_data):
        words_data = validated_data.pop('words', None)
        mistakes_data = validated_data.pop('mistakes', None)
        topics_data = validated_data.pop('next_topics', None)

        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        if words_data is not None:
            instance.words.all().delete()
            LessonSummaryWord.objects.bulk_create([
                LessonSummaryWord(lesson_summary=instance, **item)
                for item in words_data
                if item.get('word')
            ])
        if mistakes_data is not None:
            instance.mistakes.all().delete()
            LessonSummaryMistake.objects.bulk_create([
                LessonSummaryMistake(lesson_summary=instance, **item)
                for item in mistakes_data
                if item.get('mistake')
            ])
        if topics_data is not None:
            instance.next_topics.all().delete()
            LessonSummaryNextTopic.objects.bulk_create([
                LessonSummaryNextTopic(lesson_summary=instance, **item)
                for item in topics_data
                if item.get('topic')
            ])
        return instance

class AttachmentSerializer(serializers.ModelSerializer):
    file_url = serializers.FileField(source='file', read_only=True)
    file_name = serializers.SerializerMethodField()
    is_image = serializers.SerializerMethodField()
    mime_type = serializers.SerializerMethodField()
    
    class Meta:
        model = Attachment
        fields = ['id', 'file', 'file_url', 'file_name', 'is_image', 'mime_type', 'lesson']

    def get_file_name(self, obj):
        return obj.file.name.rsplit('/', 1)[-1]

    def get_mime_type(self, obj):
        mime_type, _ = mimetypes.guess_type(obj.file.name)
        return mime_type or 'application/octet-stream'

    def get_is_image(self, obj):
        return self.get_mime_type(obj).startswith('image/')

class LessonSerializer(serializers.ModelSerializer):
    new_words = NewWordSerializer(many=True, read_only=True)
    attachments = AttachmentSerializer(many=True, read_only=True)
    student_name = serializers.SerializerMethodField()
    group_name = serializers.CharField(source='group.name', read_only=True)
    group_student_names = serializers.SerializerMethodField()
    group_student_ids = serializers.SerializerMethodField()
    teacher_name = serializers.CharField(source='teacher.name', read_only=True)
    template_title = serializers.CharField(source='template.title', read_only=True)

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data['notes'] = refresh_embedded_images(
            data['notes'], [attachment.file for attachment in instance.attachments.all()],
            self.context.get('request'),
        )
        return data

    def get_student_name(self, obj):
        if obj.student_id:
            return getattr(obj.student, 'name', '') or getattr(obj.student, 'email', '')
        if obj.group_id:
            return obj.group.name
        return ''

    def get_group_student_names(self, obj):
        if not obj.group_id:
            return []
        return [
            student.name or student.email
            for student in obj.group.students.filter(role='student').order_by('name', 'email')
        ]

    def get_group_student_ids(self, obj):
        if not obj.group_id:
            return []
        return [
            str(student.id)
            for student in obj.group.students.filter(role='student').order_by('name', 'email')
        ]
    
    class Meta:
        model = Lesson
        fields = [
            'id', 'title', 'level', 'date', 'status', 'notes', 
            'meeting_url', 'recording_url', 'new_words', 'attachments', 
            'teacher', 'student', 'student_name', 'group', 'group_name',
            'group_student_names', 'group_student_ids', 'teacher_name', 'is_template',
            'is_extra', 'template', 'template_title', 'order', 'schedule_exception', 'original_date'
        ]

class HomeworkQuestionSerializer(serializers.ModelSerializer):
    image_url = serializers.FileField(source='image', read_only=True)
    audio_url = serializers.FileField(source='audio', read_only=True)
    image_path = serializers.CharField(write_only=True, required=False, allow_blank=True)
    audio_path = serializers.CharField(write_only=True, required=False, allow_blank=True)
    remove_image = serializers.BooleanField(write_only=True, required=False, default=False)
    remove_audio = serializers.BooleanField(write_only=True, required=False, default=False)
    reserve_question = serializers.JSONField(write_only=True, required=False, allow_null=True)
    has_reserve_question = serializers.SerializerMethodField()

    class Meta:
        model = HomeworkQuestion
        fields = [
            'id', 'type', 'prompt', 'image', 'image_url', 'image_path',
            'audio', 'audio_url', 'audio_path', 'audio_transcript',
            'remove_image', 'remove_audio', 'options', 'correct_option_index',
            'reference_answer', 'correction_instructions', 'explanation',
            'second_chance_mode', 'reserve_question', 'has_reserve_question', 'order',
        ]
        extra_kwargs = {
            'prompt': {'required': False, 'allow_blank': True},
            'image': {'required': False, 'allow_null': True},
            'audio': {'required': False, 'allow_null': True},
            'audio_transcript': {'required': False, 'allow_blank': True},
            'reference_answer': {'required': False, 'allow_blank': True},
            'correction_instructions': {'required': False, 'allow_blank': True},
            'explanation': {'required': False, 'allow_blank': True},
        }

    def _is_teacher_context(self):
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        return bool(user and getattr(user, 'role', None) in {'teacher', 'admin'})

    def get_has_reserve_question(self, obj):
        return bool((obj.reserve_prompt or '').strip())

    def to_representation(self, instance):
        data = super().to_representation(instance)
        reserve_question = None
        if (instance.reserve_prompt or '').strip():
            reserve_question = {
                'type': instance.reserve_type,
                'prompt': instance.reserve_prompt,
                'options': instance.reserve_options or [],
                'correct_option_index': instance.reserve_correct_option_index,
                'reference_answer': instance.reserve_reference_answer or '',
                'explanation': instance.reserve_explanation or '',
            }
        if self._is_teacher_context():
            data['reserve_question'] = reserve_question
            data['image_path'] = instance.image.name if instance.image else ''
            data['audio_path'] = instance.audio.name if instance.audio else ''
            return data

        data.pop('correct_option_index', None)
        data.pop('reference_answer', None)
        data.pop('correction_instructions', None)
        data.pop('explanation', None)
        data['reserve_question'] = None
        return data

    def validate(self, attrs):
        attrs = super().validate(attrs)
        request = self.context.get('request')
        for kind in ['image', 'audio']:
            path = attrs.get(f'{kind}_path')
            if path and (not request or not can_reuse_material_path(request.user, path, kind)):
                raise serializers.ValidationError({f'{kind}_path': 'Envie o arquivo ou escolha um material da sua própria homework.'})
        return attrs

    def validate_image(self, value):
        if not value:
            return value
        content_type = getattr(value, 'content_type', '') or ''
        if content_type and not content_type.startswith('image/'):
            raise serializers.ValidationError('Envie um arquivo de imagem válido.')
        return value

    def validate_audio(self, value):
        if not value:
            return value
        allowed_types = {
            'audio/webm',
            'audio/wav',
            'audio/wave',
            'audio/x-wav',
            'audio/mpeg',
            'audio/mp3',
            'audio/ogg',
            'audio/mp4',
            'audio/x-m4a',
            'audio/aac',
        }
        content_type = getattr(value, 'content_type', '') or ''
        if content_type and content_type not in allowed_types and not content_type.startswith('audio/'):
            raise serializers.ValidationError('Envie um arquivo de áudio válido.')
        return value

class HomeworkAnswerSerializer(serializers.ModelSerializer):
    question_prompt = serializers.CharField(source='question.prompt', read_only=True)
    question_type = serializers.CharField(source='question.type', read_only=True)
    question_options = serializers.JSONField(source='question.options', read_only=True)
    second_chance_question = serializers.SerializerMethodField()
    is_complete = serializers.SerializerMethodField()

    class Meta:
        model = HomeworkAnswer
        fields = [
            'id', 'homework', 'question', 'question_prompt', 'question_type',
            'question_options', 'student', 'answer_text', 'selected_option_index',
            'is_correct', 'auto_feedback', 'auto_explanation', 'expected_answer',
            'second_chance_question', 'second_chance_answer_text', 'second_chance_selected_option_index',
            'second_chance_is_correct', 'second_chance_feedback', 'second_chance_explanation',
            'second_chance_expected_answer', 'teacher_feedback', 'answered_at',
            'second_chance_answered_at', 'is_complete', 'created_at', 'updated_at'
        ]
        read_only_fields = [
            'student', 'is_correct', 'auto_feedback', 'auto_explanation', 'expected_answer',
            'second_chance_question', 'second_chance_answer_text', 'second_chance_selected_option_index',
            'second_chance_is_correct', 'second_chance_feedback', 'second_chance_explanation',
            'second_chance_expected_answer', 'answered_at', 'second_chance_answered_at',
            'is_complete', 'created_at', 'updated_at',
        ]

    def get_second_chance_question(self, obj):
        metadata = obj.correction_metadata if isinstance(obj.correction_metadata, dict) else {}
        question = metadata.get('second_chance_question')
        return question if isinstance(question, dict) else None

    def get_is_complete(self, obj):
        second_chance_question = self.get_second_chance_question(obj)
        if obj.is_correct is True:
            return True
        if second_chance_question:
            return obj.second_chance_is_correct is not None or obj.second_chance_answered_at is not None
        return obj.is_correct is not None

class HomeworkSerializer(serializers.ModelSerializer):
    questions = HomeworkQuestionSerializer(many=True)
    answers = HomeworkAnswerSerializer(many=True, read_only=True)
    student_name = serializers.CharField(source='student.name', read_only=True)
    group_name = serializers.CharField(source='group.name', read_only=True)
    teacher_name = serializers.CharField(source='teacher.name', read_only=True)
    lesson_title = serializers.CharField(source='lesson.title', read_only=True)

    class Meta:
        model = Homework
        fields = [
            'id', 'title', 'description', 'classification', 'status', 'due_date',
            'auto_correction_enabled', 'teacher_feedback', 'student_report', 'report_generated_at',
            'teacher', 'teacher_name', 'student', 'student_name', 'group', 'group_name',
            'lesson', 'lesson_title', 'template', 'questions', 'answers',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['created_at', 'updated_at']

    def _question_value(self, question, key, default=None):
        if isinstance(question, dict):
            return question.get(key, default)
        return getattr(question, key, default)

    def _reserve_question_payload(self, question):
        reserve_payload = self._question_value(question, 'reserve_question')
        if isinstance(reserve_payload, dict):
            return reserve_payload
        reserve_prompt = self._question_value(question, 'reserve_prompt', '')
        if reserve_prompt is None:
            return None
        return {
            'type': self._question_value(question, 'reserve_type', 'open_text'),
            'prompt': reserve_prompt,
            'options': self._question_value(question, 'reserve_options', []) or [],
            'correct_option_index': self._question_value(question, 'reserve_correct_option_index'),
        }

    def validate(self, attrs):
        attrs = super().validate(attrs)
        request = self.context.get('request')
        if request:
            if not is_admin(request.user) and request.user.role != 'teacher':
                raise serializers.ValidationError('Somente a escola pode criar ou alterar uma homework.')
            validate_managed_targets(attrs, request.user)
        if any(question.get('audio') for question in attrs.get('questions', []) if isinstance(question, dict)):
            from accounts.privacy import has_ai_consent
            if request and not has_ai_consent(request.user):
                from rest_framework.exceptions import PermissionDenied
                raise PermissionDenied('Autorize o envio de áudio à OpenAI.', code='ai_consent_required')
        status = attrs.get('status', getattr(self.instance, 'status', 'draft'))
        if status == 'draft':
            return attrs

        questions = attrs.get('questions')
        if questions is None and self.instance:
            questions = list(self.instance.questions.all())

        if questions is None or len(questions) == 0:
            raise serializers.ValidationError({'questions': 'Adicione pelo menos uma pergunta.'})

        auto_correction_enabled = attrs.get(
            'auto_correction_enabled',
            getattr(self.instance, 'auto_correction_enabled', True),
        )
        question_errors = [{} for _ in questions]

        def add_error(index, field, message):
            question_errors[index].setdefault(field, []).append(message)

        for index, question in enumerate(questions):
            prompt = str(self._question_value(question, 'prompt', '') or '').strip()
            if not prompt:
                add_error(index, 'prompt', 'Preencha o texto da pergunta.')

            question_type = self._question_value(question, 'type', 'open_text')
            if question_type == 'multiple_choice':
                options = self._question_value(question, 'options', []) or []
                filled_options = [item for item in options if str(item).strip()]
                correct_option_index = self._question_value(question, 'correct_option_index')
                if len(filled_options) < 2:
                    add_error(index, 'options', 'Adicione pelo menos duas opções.')
                if (
                    correct_option_index is None
                    or correct_option_index < 0
                    or correct_option_index >= len(options)
                    or not str(options[correct_option_index] or '').strip()
                ):
                    add_error(index, 'correct_option_index', 'Selecione a alternativa correta.')

            second_chance_mode = self._question_value(question, 'second_chance_mode', 'none')
            if auto_correction_enabled and second_chance_mode == 'reserve':
                reserve_payload = self._reserve_question_payload(question)
                reserve_prompt = str((reserve_payload or {}).get('prompt') or '').strip()
                if not reserve_prompt:
                    add_error(index, 'reserve_question', 'Cadastre a questão reserva ou selecione "Sem segunda chance".')
                    continue

                reserve_type = (reserve_payload or {}).get('type') or 'open_text'
                if reserve_type == 'multiple_choice':
                    reserve_options = (reserve_payload or {}).get('options') or []
                    reserve_filled_options = [item for item in reserve_options if str(item).strip()]
                    reserve_index = (reserve_payload or {}).get('correct_option_index')
                    if len(reserve_filled_options) < 2:
                        add_error(index, 'reserve_question', 'A questão reserva precisa ter pelo menos duas opções.')
                    if (
                        reserve_index is None
                        or reserve_index < 0
                        or reserve_index >= len(reserve_options)
                        or not str(reserve_options[reserve_index] or '').strip()
                    ):
                        add_error(index, 'reserve_question', 'Selecione a alternativa correta da questão reserva.')

        if any(question_errors):
            raise serializers.ValidationError({'questions': question_errors})

        return attrs

    def _transcribe_audio(self, audio_file):
        if not audio_file:
            return ''
        try:
            from ai_study.services import AIStudyOpenAIService

            audio_file.seek(0)
            transcript = AIStudyOpenAIService.transcribe(audio_file)
            audio_file.seek(0)
            return transcript or ''
        except Exception:
            try:
                audio_file.seek(0)
            except Exception:
                pass
            return ''

    def _question_kwargs(self, question_data, index):
        question_payload = dict(question_data)
        image_path = question_payload.pop('image_path', '')
        audio_path = question_payload.pop('audio_path', '')
        remove_image = question_payload.pop('remove_image', False)
        remove_audio = question_payload.pop('remove_audio', False)
        reserve_question = question_payload.pop('reserve_question', None)
        image = question_payload.get('image')
        audio = question_payload.get('audio')

        if remove_image:
            question_payload['image'] = None
        elif not image and image_path:
            question_payload['image'] = image_path

        if remove_audio:
            question_payload['audio'] = None
            question_payload['audio_transcript'] = ''
        elif not audio and audio_path:
            question_payload['audio'] = audio_path
        elif audio and not question_payload.get('audio_transcript'):
            question_payload['audio_transcript'] = self._transcribe_audio(audio)

        if isinstance(reserve_question, dict):
            question_payload['reserve_type'] = reserve_question.get('type') or 'open_text'
            question_payload['reserve_prompt'] = reserve_question.get('prompt') or ''
            question_payload['reserve_options'] = reserve_question.get('options') or []
            question_payload['reserve_correct_option_index'] = reserve_question.get('correct_option_index')
            question_payload['reserve_reference_answer'] = reserve_question.get('reference_answer') or ''
            question_payload['reserve_explanation'] = reserve_question.get('explanation') or ''
        elif reserve_question is None and question_payload.get('second_chance_mode') == 'reserve':
            question_payload['reserve_type'] = 'open_text'
            question_payload['reserve_prompt'] = ''
            question_payload['reserve_options'] = []
            question_payload['reserve_correct_option_index'] = None
            question_payload['reserve_reference_answer'] = ''
            question_payload['reserve_explanation'] = ''

        question_payload['order'] = question_payload.get('order', index)
        return question_payload

    def create(self, validated_data):
        questions_data = validated_data.pop('questions', [])
        homework = Homework.objects.create(**validated_data)
        for index, question_data in enumerate(questions_data):
            HomeworkQuestion.objects.create(homework=homework, **self._question_kwargs(question_data, index))
        return homework

    def update(self, instance, validated_data):
        questions_data = validated_data.pop('questions', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        if questions_data is not None:
            instance.questions.all().delete()
            for index, question_data in enumerate(questions_data):
                sanitized = {key: value for key, value in question_data.items() if key != 'id'}
                HomeworkQuestion.objects.create(homework=instance, **self._question_kwargs(sanitized, index))
        return instance

class HomeworkTemplateSerializer(serializers.ModelSerializer):
    def to_representation(self, instance):
        from copy import deepcopy
        from django.core.files.storage import default_storage
        data = super().to_representation(instance)
        data['questions'] = deepcopy(data.get('questions', []))
        request = self.context.get('request')
        for question in data.get('questions', []):
            if not isinstance(question, dict):
                continue
            for kind in ['image', 'audio']:
                path = question.get(f'{kind}_path')
                if request and path and can_reuse_material_path(request.user, path, kind):
                    question[f'{kind}_url'] = request.build_absolute_uri(default_storage.url(path))
        return data

    def validate(self, attrs):
        request = self.context.get('request')
        if request:
            validate_managed_targets(attrs, request.user)
            source = attrs.get('source_homework')
            if source and not is_admin(request.user) and source.teacher_id != request.user.pk:
                raise serializers.ValidationError({'source_homework': 'Homework fora do seu vínculo.'})
            for item in attrs.get('questions', []):
                for kind in ['image', 'audio']:
                    path = item.get(f'{kind}_path')
                    if path and not can_reuse_material_path(request.user, path, kind):
                        raise serializers.ValidationError({'questions': 'Material fora do seu vínculo.'})
        return attrs

    class Meta:
        model = HomeworkTemplate
        fields = [
            'id', 'title', 'description', 'classification', 'teacher',
            'source_homework', 'questions', 'created_at', 'updated_at'
        ]
        read_only_fields = ['created_at', 'updated_at']
