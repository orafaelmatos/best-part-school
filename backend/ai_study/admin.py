from django.contrib import admin
from .models import (
    AIContextLesson,
    AIConversationMessage,
    AIStudySession,
    PronunciationReview,
    SpeakingAudio,
    SpeakingFeedback,
)


@admin.register(AIStudySession)
class AIStudySessionAdmin(admin.ModelAdmin):
    list_display = ('student', 'mode', 'theme', 'status', 'created_at')
    list_filter = ('mode', 'theme', 'status')
    search_fields = ('student__email', 'student__name', 'custom_topic')


admin.site.register(AIContextLesson)
admin.site.register(SpeakingAudio)
admin.site.register(SpeakingFeedback)
admin.site.register(PronunciationReview)
admin.site.register(AIConversationMessage)
