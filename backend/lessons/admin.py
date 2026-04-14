from django.contrib import admin
from .models import Lesson, NewWord, Attachment

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
