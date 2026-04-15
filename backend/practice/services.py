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
        You are an English tutor. Student Level: {level}. 
        Scenario: {session.scenario}. Practice mode: {session.mode}.
        Correct mistakes and continue the conversation naturally. Keep responses concise to save tokens.
        CRITICAL RULE: ALL YOUR RESPONSES (both text and audio) MUST BE IN ENGLISH ONLY! Do not reply in Portuguese or any other language, even if the student speaks in another language.
        DO NOT invent corrections if the user's message is correct. If the user's message is grammatically fine and completely understandable, you MUST return an empty list for "corrections".
        """
        
        if session.mode == 'speaking':
            sys_prompt += """
            For speaking mode, focus on pronunciation or vocabulary mistakes. Provide the correction in the "corrections" array (like "Mistake -> Fix") AND set 'audio_text' to the exact phrase the user should practice. If NO corrections are needed, set "corrections": [] and leave 'audio_text' empty ("").
            You MUST respond strictly in valid JSON format matching this schema:
            {"text": "Your conversational response", "corrections": ["Mistake -> Fix"], "audio_text": "Text for audio correction or empty string"}
            """
        elif session.mode == 'listening':
            sys_prompt += """
            For listening mode, your "text" response will be converted to audio. Give a short, natural response.
            You MUST respond strictly in valid JSON format matching this schema:
            {"text": "The response to be spoken and transcribed", "corrections": ["Mistake -> Fix"]}
            """
        else:
            sys_prompt += """
            You MUST respond strictly in valid JSON format matching this schema:
            {"text": "Your conversational response", "corrections": ["Mistake -> Fix"]}
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
