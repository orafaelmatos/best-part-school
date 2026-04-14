# 🤖 AI English Practice Feature

## 📂 6. Folder Structure
```text
backend/
  practice/
    __init__.py
    models.py      # PracticeSession, Message models
    services.py    # AIService, STTService, TTSService
    views.py       # API endpoints
    urls.py        # URLs routing
    serializers.py # DRF Serializers

src/
  pages/
    Practice/
      index.tsx          # Main practice screen
      ChatInterface.tsx  # Message list
      AudioRecorder.tsx  # Mic controls
  services/
    aiTutor.ts           # Frontend API client
```

---

## 🏗️ 1. Django Models (`backend/practice/models.py`)

```python
import uuid
from django.db import models
from django.conf import settings
from lessons.models import Lesson

User = settings.AUTH_USER_MODEL

class PracticeSession(models.Model):
    MODE_CHOICES = (
        ('listening', 'Listening'),
        ('speaking', 'Speaking'),
        ('writing', 'Writing'),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='practice_sessions')
    lesson = models.ForeignKey(Lesson, null=True, blank=True, on_delete=models.SET_NULL)
    mode = models.CharField(max_length=20, choices=MODE_CHOICES)
    scenario = models.CharField(max_length=100) # e.g. "Hotel", "Restaurant"
    status = models.CharField(max_length=20, default='active') # active, completed
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.user.email} - {self.mode} - {self.scenario}"

class Message(models.Model):
    ROLE_CHOICES = (('system', 'System'), ('user', 'User'), ('assistant', 'Assistant'))

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    session = models.ForeignKey(PracticeSession, on_delete=models.CASCADE, related_name='messages')
    role = models.CharField(max_length=20, choices=ROLE_CHOICES)
    text = models.TextField()
    audio_url = models.URLField(blank=True, null=True) # TTS or STT audio ref
    corrections = models.JSONField(blank=True, null=True) # Structural corrections from AI
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['created_at']
```

---

## ⚙️ 2. Django Services (`backend/practice/services.py`)

```python
# Mocks for external providers (OpenAI, AWS, etc)
class SpeechToTextService:
    @staticmethod
    def transcribe(audio_file) -> str:
        # e.g., call openai.Audio.transcribe("whisper-1", audio_file)
        return "I would like to order a pizza, please."

class TextToSpeechService:
    @staticmethod
    def generate_audio(text: str) -> str:
        # e.g., call EleveLabs or OpenAI TTS, save to S3, return URL
        return "https://s3.aws.com/fake-audio.mp3"

class AIService:
    @staticmethod
    def generate_tutor_response(session, user_message: str):
        # Build context from previous messages
        history = list(session.messages.values('role', 'text'))
        
        # Example prompt injection
        level = session.user.level or "A2"
        sys_prompt = f"""
        You are an English tutor. The student is Level {level}. 
        Scenario: {session.scenario}.
        Correct any mistakes and continue the conversation naturally.
        Respond in JSON format: {{"text": "Response", "corrections": ["Mistake -> Fix"]}}
        """
        
        # call openai.ChatCompletion.create(...)
        # mock response:
        return {
            "text": "Great! What kind of pizza would you like?",
            "corrections": []
        }
```

---

## 🌐 3. API Views (`backend/practice/views.py`)

```python
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

    @action(detail=True, methods=['post'])
    def message(self, request, pk=None):
        session = self.get_object()
        text = request.data.get('text')
        audio = request.FILES.get('audio')

        # 1. Process Speech-to-Text if audio was provided (Speaking Mode)
        if audio and session.mode == 'speaking':
            text = SpeechToTextService.transcribe(audio)

        if not text:
            return Response({"error": "No text or audio provided."}, status=status.HTTP_400_BAD_REQUEST)

        # 2. Save User Message
        user_msg = Message.objects.create(session=session, role='user', text=text)

        # 3. Generate AI Response
        ai_response = AIService.generate_tutor_response(session, text)
        
        # 4. Process Text-to-Speech (if applicable)
        audio_url = None
        if session.mode in ['listening', 'speaking']:
            audio_url = TextToSpeechService.generate_audio(ai_response['text'])

        # 5. Save AI Message
        ai_msg = Message.objects.create(
            session=session, 
            role='assistant', 
            text=ai_response['text'],
            corrections=ai_response.get('corrections', []),
            audio_url=audio_url
        )

        return Response(MessageSerializer(ai_msg).data)
```

---

## ⚛️ 4. React Components (`src/pages/Practice/index.tsx`)

```tsx
import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import DashboardLayout from '@/components/DashboardLayout';
import { Mic, Send, PlayCircle } from 'lucide-react';

export default function PracticeMode() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [inputText, setInputText] = useState('');

  // Simplified mutation for text
  const sendMessage = useMutation({
    mutationFn: async (text: string) => {
      const res = await api.post(`/practice/${sessionId}/message/`, { text });
      return res.data;
    },
    onSuccess: (aiMsg) => {
      setMessages(prev => [...prev, aiMsg]);
    }
  });

  const handleSend = () => {
    if (!inputText) return;
    setMessages(prev => [...prev, { role: 'user', text: inputText }]);
    sendMessage.mutate(inputText);
    setInputText('');
  };

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto flex flex-col h-[80vh] bg-card border rounded-xl overflow-hidden">
        
        {/* Header */}
        <div className="p-4 border-b bg-muted/30">
          <h2 className="font-bold text-lg text-primary">AI English Tutor - Restaurant Scenario</h2>
        </div>

        {/* Chat Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {messages.map((msg, idx) => (
            <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[75%] p-4 rounded-xl ${msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                <p>{msg.text}</p>
                {msg.corrections?.length > 0 && (
                  <div className="mt-2 text-sm bg-yellow-100/10 text-yellow-600 p-2 rounded">
                    <strong>Corrections:</strong> {msg.corrections.join(', ')}
                  </div>
                )}
                {msg.audio_url && (
                  <button className="mt-2 flex items-center gap-1 text-sm bg-background/50 px-2 py-1 rounded">
                    <PlayCircle size={16} /> Ouvir Pronúncia
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Input Area */}
        <div className="p-4 border-t bg-background flex gap-2">
          <button className="p-3 bg-secondary text-secondary-foreground rounded-full hover:bg-secondary/80">
            <Mic size={20} />
          </button>
          <input 
            type="text" 
            placeholder="Type your message..." 
            className="flex-1 border rounded-full px-4 text-sm"
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSend()}
          />
          <button onClick={handleSend} className="p-3 bg-primary text-primary-foreground rounded-full hover:bg-primary/90">
            <Send size={20} />
          </button>
        </div>

      </div>
    </DashboardLayout>
  );
}
```

---

## 🧠 5. Example LLM Prompts (`AI_PROMPTS.md`)

```markdown
### Speaking Mode (Level A2)
**System:** 
You are an enthusiastic default English tutor. 
The user is a Level A2 student. Keep sentences short and use simple vocabulary. 
Current Scenario: "Checking into a hotel".
Wait for the user to prompt you first. 
If the user makes a mistake, return a polite correction in your JSON breakdown.

**Requirements:**
Return ONLY valid JSON:
{
  "text": "Your conversational reply here",
  "corrections": ["Array of grammar/vocab corrections (max 2), or empty array"],
  "encouragement": "Short encouraging phrase"
}

### Writing Mode (Level B2)
**System:**
You are an advanced English Writing Tutor.
The user submitted a paragraph based on their last lesson (Topic: Business Meetings).
Assess their text for B2-level flow, vocabulary choice, and grammar.

**Requirements:**
Return JSON:
{
  "improved_text": "The fully rewritten version of their paragraph",
  "feedback_points": [
    "Used 'make a meeting' instead of 'schedule a meeting'",
    "Good use of passive voice"
  ]
}
```