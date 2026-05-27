from django.contrib import admin
from .models import Lesson, NewWord, Attachment, Homework, HomeworkQuestion, HomeworkAnswer, HomeworkTemplate, VocabularyCard, VocabularyCategory, VocabularyReviewLog, LessonSummary, LessonSummaryWord, LessonSummaryMistake, LessonSummaryNextTopic

class NewWordInline(admin.TabularInline):
    model = NewWord
    extra = 1

class AttachmentInline(admin.TabularInline):
    model = Attachment
    extra = 1

@admin.register(Lesson)
class LessonAdmin(admin.ModelAdmin):
    list_display = ('title', 'date', 'level', 'teacher', 'student', 'status')
    list_filter = ('status', 'level', 'teacher', 'student')
    search_fields = ('title', 'teacher__email', 'student__email')
    inlines = [NewWordInline, AttachmentInline]

@admin.register(NewWord)
class NewWordAdmin(admin.ModelAdmin):
    list_display = ('word', 'lesson', 'level')
    search_fields = ('word', 'meaning')

@admin.register(Attachment)
class AttachmentAdmin(admin.ModelAdmin):
    list_display = ('file', 'lesson', 'uploaded_at')

class HomeworkQuestionInline(admin.TabularInline):
    model = HomeworkQuestion
    extra = 1

class HomeworkAnswerInline(admin.TabularInline):
    model = HomeworkAnswer
    extra = 0

@admin.register(Homework)
class HomeworkAdmin(admin.ModelAdmin):
    list_display = ('title', 'lesson', 'teacher', 'student', 'status', 'due_date')
    list_filter = ('status', 'classification', 'teacher', 'student')
    search_fields = ('title', 'description', 'lesson__title')
    inlines = [HomeworkQuestionInline, HomeworkAnswerInline]

@admin.register(HomeworkTemplate)
class HomeworkTemplateAdmin(admin.ModelAdmin):
    list_display = ('title', 'teacher', 'classification', 'created_at')
    list_filter = ('classification', 'teacher')
    search_fields = ('title', 'description')

@admin.register(VocabularyCategory)
class VocabularyCategoryAdmin(admin.ModelAdmin):
    list_display = ('name', 'slug', 'owner', 'is_default')
    list_filter = ('is_default',)
    search_fields = ('name', 'slug')

@admin.register(VocabularyCard)
class VocabularyCardAdmin(admin.ModelAdmin):
    list_display = ('word', 'student', 'teacher', 'difficulty_level', 'interval_days', 'confidence_level', 'next_review_at')
    list_filter = ('difficulty_level', 'mastered', 'archived', 'source_type')
    search_fields = ('word', 'translation', 'student__email', 'teacher__email')
    readonly_fields = ('easiness_factor', 'interval_days', 'repetition_count', 'failure_count', 'confidence_level', 'last_reviewed_at')

@admin.register(VocabularyReviewLog)
class VocabularyReviewLogAdmin(admin.ModelAdmin):
    list_display = ('card', 'student', 'rating', 'new_interval_days', 'new_easiness_factor', 'reviewed_at')
    list_filter = ('rating',)
    search_fields = ('card__word', 'student__email')

class LessonSummaryWordInline(admin.TabularInline):
    model = LessonSummaryWord
    extra = 0

class LessonSummaryMistakeInline(admin.TabularInline):
    model = LessonSummaryMistake
    extra = 0

class LessonSummaryNextTopicInline(admin.TabularInline):
    model = LessonSummaryNextTopic
    extra = 0

@admin.register(LessonSummary)
class LessonSummaryAdmin(admin.ModelAdmin):
    list_display = ('lesson', 'student', 'teacher', 'created_at')
    list_filter = ('teacher', 'student')
    search_fields = ('lesson__title', 'student__email', 'teacher__email', 'summary', 'homework')
    inlines = [LessonSummaryWordInline, LessonSummaryMistakeInline, LessonSummaryNextTopicInline]
