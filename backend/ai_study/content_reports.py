from django.contrib import admin
from rest_framework import permissions, serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView
from .models import AIContentReport, AIConversationMessage
from .permissions import can_access_student


class ContentReportSerializer(serializers.ModelSerializer):
    message_id = serializers.UUIDField(write_only=True)

    class Meta:
        model = AIContentReport
        fields = ['id', 'message_id', 'reason', 'details', 'created_at']
        read_only_fields = ['id', 'created_at']

    def validate_message_id(self, value):
        message = AIConversationMessage.objects.select_related('session__student').filter(pk=value, role='assistant').first()
        if not message or not can_access_student(self.context['request'].user, message.session.student):
            raise serializers.ValidationError('Resposta não encontrada.')
        return message

    def create(self, validated_data):
        message = validated_data.pop('message_id')
        return AIContentReport.objects.create(
            reporter=self.context['request'].user, message=message,
            reported_text=message.text[:8000], **validated_data,
        )


class ContentReportView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        serializer = ContentReportSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED)


@admin.register(AIContentReport)
class AIContentReportAdmin(admin.ModelAdmin):
    list_display = ['id', 'reporter', 'reason', 'status', 'created_at']
    list_filter = ['reason', 'status']
    readonly_fields = ['reporter', 'message', 'reported_text', 'reason', 'details', 'created_at']
    fields = [*readonly_fields, 'status', 'resolution_notes']

    def has_add_permission(self, request):
        return False
