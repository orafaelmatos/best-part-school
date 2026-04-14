import os
import json
import uuid
from django.conf import settings
from openai import OpenAI

# The OpenAI client will automatically look for OPENAI_API_KEY in the environment
client = OpenAI()

class SpeechToTextService:
    @staticmethod
    def transcribe(audio_file) -> str:
        response = client.audio.transcriptions.create(
            model="whisper-1",
            file=audio_file
        )
        return response.text

class TextToSpeechService:
    @staticmethod
    def generate_audio(text: str) -> str:
        response = client.audio.speech.create(
            model="tts-1",
            voice="alloy",
            input=text
        )
        
        media_path = os.path.join(settings.MEDIA_ROOT, 'practice_audio')
        os.makedirs(media_path, exist_ok=True)
        
        filename = f"{uuid.uuid4().hex}.mp3"
        filepath = os.path.join(media_path, filename)
        
        response.stream_to_file(filepath)
        
        # Return partial URL mapped to the MEDIA_URL
        # ensure no double slash
        media_url = settings.MEDIA_URL if settings.MEDIA_URL.endswith('/') else f"{settings.MEDIA_URL}/"
        return f"{media_url}practice_audio/{filename}"

class AIService:
    @staticmethod
    def generate_tutor_response(session, user_message: str):
        # Build context from previous messages
        history = list(session.messages.order_by('created_at').values('role', 'text'))
        
        level = "A2"
        if session.user and getattr(session.user, 'level', None):
            level = session.user.level
            
        sys_prompt = f"""
        You are an English tutor. The student is Level {level}. 
        Scenario: {session.scenario}.
        Correct any mistakes and continue the conversation naturally.
        You MUST respond strictly in valid JSON format matching this schema:
        {{"text": "Your conversational response", "corrections": ["Detailed Mistake -> Explanation"]}}
        """
        
        messages = [{"role": "system", "content": sys_prompt}]
        for msg in history:
            role = "assistant" if msg['role'] == "assistant" else "user"
            messages.append({"role": role, "content": msg['text']})
            
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=messages,
            response_format={"type": "json_object"}
        )
        
        try:
            content = response.choices[0].message.content
            return json.loads(content)
        except Exception:
            return {
                "text": "I'm sorry, I didn't quite catch that. Could you say it again?",
                "corrections": []
            }
