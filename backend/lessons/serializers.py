from rest_framework import serializers
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

class StudentRecurringScheduleSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source='student.name', read_only=True)
    teacher_name = serializers.CharField(source='teacher.name', read_only=True)

    class Meta:
        model = StudentRecurringSchedule
        fields = ['id', 'student', 'student_name', 'teacher', 'teacher_name', 'day_of_week', 'start_time', 'active']

class TeacherAvailabilitySerializer(serializers.ModelSerializer):
    class Meta:
        model = TeacherAvailability
        fields = ['id', 'teacher', 'day_of_week', 'start_time', 'end_time']

class TeacherBlockedDateSerializer(serializers.ModelSerializer):
    class Meta:
        model = TeacherBlockedDate
        fields = ['id', 'teacher', 'date', 'reason']

class NewWordSerializer(serializers.ModelSerializer):
    class Meta:
        model = NewWord
        fields = ['id', 'word', 'meaning', 'level', 'status']

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
            'next_review_at', 'mastered', 'created_at', 'updated_at',
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
    student_name = serializers.CharField(source='student.name', read_only=True)
    teacher_name = serializers.CharField(source='teacher.name', read_only=True)
    template_title = serializers.CharField(source='template.title', read_only=True)
    
    class Meta:
        model = Lesson
        fields = [
            'id', 'title', 'level', 'date', 'status', 'notes', 
            'meeting_url', 'recording_url', 'new_words', 'attachments', 
            'teacher', 'student', 'student_name', 'teacher_name', 'is_template',
            'template', 'template_title', 'order'
        ]

class HomeworkQuestionSerializer(serializers.ModelSerializer):
    image_url = serializers.FileField(source='image', read_only=True)
    audio_url = serializers.FileField(source='audio', read_only=True)
    image_path = serializers.CharField(write_only=True, required=False, allow_blank=True)
    audio_path = serializers.CharField(write_only=True, required=False, allow_blank=True)
    remove_image = serializers.BooleanField(write_only=True, required=False, default=False)
    remove_audio = serializers.BooleanField(write_only=True, required=False, default=False)
    reserve_question = serializers.JSONField(write_only=True, required=False)
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
            return data

        data.pop('correct_option_index', None)
        data.pop('reference_answer', None)
        data.pop('correction_instructions', None)
        data.pop('explanation', None)
        data['reserve_question'] = None
        return data

    def validate(self, attrs):
        attrs = super().validate(attrs)
        question_type = attrs.get('type') or getattr(self.instance, 'type', '')
        options = attrs.get('options')
        correct_option_index = attrs.get('correct_option_index')

        if question_type == 'multiple_choice':
            if options is not None and len([item for item in options if str(item).strip()]) < 2:
                raise serializers.ValidationError({'options': 'Adicione pelo menos duas opções.'})
            if correct_option_index is None:
                correct_option_index = getattr(self.instance, 'correct_option_index', None)
            current_options = options if options is not None else getattr(self.instance, 'options', [])
            if correct_option_index is None or correct_option_index < 0 or correct_option_index >= len(current_options or []):
                raise serializers.ValidationError({'correct_option_index': 'Selecione a alternativa correta.'})

        reserve_question = attrs.get('reserve_question')
        second_chance_mode = attrs.get('second_chance_mode') or getattr(self.instance, 'second_chance_mode', 'ai_generated')
        if second_chance_mode == 'reserve':
            reserve_payload = reserve_question
            if reserve_payload is None and self.instance:
                reserve_payload = {
                    'prompt': getattr(self.instance, 'reserve_prompt', ''),
                }
            if not isinstance(reserve_payload, dict) or not str(reserve_payload.get('prompt') or '').strip():
                raise serializers.ValidationError({'reserve_question': 'Cadastre a questão reserva para usar esta opção.'})
            reserve_type = reserve_payload.get('type') or 'open_text'
            if reserve_type == 'multiple_choice':
                reserve_options = [item for item in reserve_payload.get('options', []) if str(item).strip()]
                reserve_index = reserve_payload.get('correct_option_index')
                if len(reserve_options) < 2:
                    raise serializers.ValidationError({'reserve_question': 'A questão reserva precisa ter pelo menos duas opções.'})
                if reserve_index is None or reserve_index < 0 or reserve_index >= len(reserve_options):
                    raise serializers.ValidationError({'reserve_question': 'Selecione a alternativa correta da questão reserva.'})

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
    teacher_name = serializers.CharField(source='teacher.name', read_only=True)
    lesson_title = serializers.CharField(source='lesson.title', read_only=True)

    class Meta:
        model = Homework
        fields = [
            'id', 'title', 'description', 'classification', 'status', 'due_date',
            'auto_correction_enabled', 'teacher_feedback', 'student_report', 'report_generated_at',
            'teacher', 'teacher_name', 'student', 'student_name',
            'lesson', 'lesson_title', 'template', 'questions', 'answers',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['created_at', 'updated_at']

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
    class Meta:
        model = HomeworkTemplate
        fields = [
            'id', 'title', 'description', 'classification', 'teacher',
            'source_homework', 'questions', 'created_at', 'updated_at'
        ]
        read_only_fields = ['created_at', 'updated_at']
