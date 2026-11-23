from django.db import transaction
from django.utils import timezone
from rest_framework import permissions, serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView
from .models import AIConsentRecord

AI_CONSENT_VERSION = '2026-11-23'


def has_ai_consent(user):
    return user.is_authenticated and user.ai_consent_version == AI_CONSENT_VERSION and bool(user.ai_consent_at)


class HasAIConsent(permissions.BasePermission):
    message = 'Autorize o envio de dados à OpenAI antes de usar esta prática.'
    code = 'ai_consent_required'
    local_actions = {'list', 'retrieve', 'history', 'destroy', 'rename', 'pin', 'archive'}

    def has_permission(self, request, view):
        if getattr(view, 'action', '') in self.local_actions or request.method in permissions.SAFE_METHODS:
            return True
        return has_ai_consent(request.user)

    def has_object_permission(self, request, view, obj):
        if getattr(view, 'action', '') in self.local_actions or request.method in permissions.SAFE_METHODS:
            return True
        student = getattr(obj, 'student', None)
        if student is None and getattr(obj, 'session_id', None):
            student = obj.session.student
        students = [student] if student is not None else []
        if getattr(obj, 'group_id', None):
            students.extend(obj.group.students.all())
        if any(not has_ai_consent(person) for person in students):
            self.message = 'O aluno precisa autorizar o uso de seus dados com IA no próprio perfil antes desta operação.'
            self.code = 'student_ai_consent_required'
            return False
        return True


class AIActionConsentMixin:
    ai_actions = {
        'generate_word_sentences', 'generate_word_sentence', 'rewrite_word_sentence',
        'generate_summary', 'audio', 'submit_answers', 'answer_question',
        'answer_second_chance', 'request_second_chance', 'teacher_focus_report',
    }

    def get_permissions(self):
        result = super().get_permissions()
        if getattr(self, 'action', '') in self.ai_actions:
            result.append(HasAIConsent())
        return result


class AIConsentView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        return Response({
            'accepted': has_ai_consent(request.user), 'version': AI_CONSENT_VERSION,
            'accepted_at': request.user.ai_consent_at if has_ai_consent(request.user) else None,
            'provider': 'OpenAI',
        })

    @transaction.atomic
    def put(self, request):
        if request.data.get('accepted') is not True or request.data.get('version') != AI_CONSENT_VERSION:
            raise serializers.ValidationError('Confirme explicitamente a versão atual do consentimento.')
        request.user.ai_consent_version = AI_CONSENT_VERSION
        request.user.ai_consent_at = timezone.now()
        request.user.save(update_fields=['ai_consent_version', 'ai_consent_at'])
        AIConsentRecord.objects.create(user=request.user, version=AI_CONSENT_VERSION, accepted=True)
        return self.get(request)

    @transaction.atomic
    def delete(self, request):
        AIConsentRecord.objects.create(user=request.user, version=AI_CONSENT_VERSION, accepted=False)
        request.user.ai_consent_version = ''
        request.user.ai_consent_at = None
        request.user.save(update_fields=['ai_consent_version', 'ai_consent_at'])
        return Response(status=status.HTTP_204_NO_CONTENT)


class DeleteOwnAccountView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        if request.user.role != 'student':
            raise serializers.ValidationError('Contas de gestão precisam transferir seus vínculos com a administração antes da exclusão.')
        password = request.data.get('password')
        if not isinstance(password, str) or not request.user.check_password(password):
            raise serializers.ValidationError({'password': 'Confirme sua senha atual.'})
        if request.data.get('confirmation') != 'EXCLUIR':
            raise serializers.ValidationError({'confirmation': 'Digite EXCLUIR para confirmar.'})
        request.user.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
