from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from .models import PracticeSession, Message
from .serializers import PracticeSessionSerializer, MessageSerializer
from .services import AIService, SpeechToTextService, TextToSpeechService

class PracticeSessionViewSet(viewsets.ModelViewSet):
    serializer_class = PracticeSessionSerializer

    def get_queryset(self):
        return PracticeSession.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    @action(detail=True, methods=['post'])
    def message(self, request, pk=None):
        session = self.get_object()
        text = request.data.get('text')
        audio = request.FILES.get('audio')

        if audio and session.mode == 'speaking':
            text = SpeechToTextService.transcribe(audio)

        if not text:
            return Response({"error": "No text or audio provided."}, status=status.HTTP_400_BAD_REQUEST)

        user_msg = Message.objects.create(session=session, role='user', text=text)

        ai_response = AIService.generate_tutor_response(session, text)
        
        audio_url = None
        if session.mode == 'listening':
            audio_url = TextToSpeechService.generate_audio(ai_response['text'])
        elif session.mode == 'speaking':
            audio_text = ai_response.get('audio_text')
            if audio_text:
                audio_url = TextToSpeechService.generate_audio(audio_text)

        ai_msg = Message.objects.create(
            session=session, 
            role='assistant', 
            text=ai_response['text'],
            corrections=ai_response.get('corrections', []),
            audio_url=audio_url
        )

        return Response(MessageSerializer(ai_msg).data)