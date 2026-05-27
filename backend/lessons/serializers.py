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
    class Meta:
        model = HomeworkQuestion
        fields = ['id', 'type', 'prompt', 'options', 'correct_option_index', 'order']

class HomeworkAnswerSerializer(serializers.ModelSerializer):
    question_prompt = serializers.CharField(source='question.prompt', read_only=True)
    question_type = serializers.CharField(source='question.type', read_only=True)
    question_options = serializers.JSONField(source='question.options', read_only=True)

    class Meta:
        model = HomeworkAnswer
        fields = [
            'id', 'homework', 'question', 'question_prompt', 'question_type',
            'question_options', 'student', 'answer_text', 'selected_option_index',
            'teacher_feedback', 'created_at', 'updated_at'
        ]
        read_only_fields = ['student', 'created_at', 'updated_at']

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
            'teacher_feedback', 'teacher', 'teacher_name', 'student', 'student_name',
            'lesson', 'lesson_title', 'template', 'questions', 'answers',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['created_at', 'updated_at']

    def create(self, validated_data):
        questions_data = validated_data.pop('questions', [])
        homework = Homework.objects.create(**validated_data)
        for index, question_data in enumerate(questions_data):
            HomeworkQuestion.objects.create(
                homework=homework,
                order=question_data.get('order', index),
                **{key: value for key, value in question_data.items() if key != 'order'}
            )
        return homework

    def update(self, instance, validated_data):
        questions_data = validated_data.pop('questions', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        if questions_data is not None:
            instance.questions.all().delete()
            for index, question_data in enumerate(questions_data):
                HomeworkQuestion.objects.create(
                    homework=instance,
                    order=question_data.get('order', index),
                    **{key: value for key, value in question_data.items() if key not in ['id', 'order']}
                )
        return instance

class HomeworkTemplateSerializer(serializers.ModelSerializer):
    class Meta:
        model = HomeworkTemplate
        fields = [
            'id', 'title', 'description', 'classification', 'teacher',
            'source_homework', 'questions', 'created_at', 'updated_at'
        ]
        read_only_fields = ['created_at', 'updated_at']
