"""Offline media, finance and saved conversations for the local demo seed."""

import datetime
import io
import uuid
import wave
from decimal import Decimal
from pathlib import Path
from xml.sax.saxutils import escape

from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.utils import timezone

from ai_study.models import (
    AIContextLesson, AIConversationMessage, AIStudySession,
    SpeakingAudio, SpeakingFeedback, WritingFeedback,
)
from lessons.models import Attachment, HomeworkQuestion
from marketplace.models import Course
from payments.models import FinancialSettings, FinancialTimelineEntry, Payment, PaymentReceipt


def demo_id(student, key):
    return uuid.uuid5(uuid.NAMESPACE_URL, f'bps-mobile-demo-extras/{student.pk}/{key}')


def pdf_bytes(title, lines):
    def quote(text):
        return text.encode('ascii', 'replace').decode('ascii').replace('\\', '\\\\').replace('(', '\\(').replace(')', '\\)')
    text = f'BT /F1 18 Tf 50 760 Td ({quote(title)}) Tj /F1 11 Tf\n'
    text += ''.join(f'0 -28 Td ({quote(line)}) Tj\n' for line in lines)
    text += 'ET'
    stream = text.encode('ascii')
    objects = [
        b'<< /Type /Catalog /Pages 2 0 R >>',
        b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
        b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
        b'<< /Length ' + str(len(stream)).encode() + b' >>\nstream\n' + stream + b'\nendstream',
    ]
    output = bytearray(b'%PDF-1.4\n')
    offsets = [0]
    for index, obj in enumerate(objects, 1):
        offsets.append(len(output))
        output.extend(f'{index} 0 obj\n'.encode() + obj + b'\nendobj\n')
    xref = len(output)
    output.extend(f'xref\n0 {len(objects) + 1}\n0000000000 65535 f \n'.encode())
    for offset in offsets[1:]:
        output.extend(f'{offset:010d} 00000 n \n'.encode())
    output.extend(f'trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n'.encode())
    return bytes(output)


def save_fixture(name, content):
    if not default_storage.exists(name):
        return default_storage.save(name, ContentFile(content))
    return name


def seed_demo_extras(student, teacher, lessons, anchor_date):
    if not lessons:
        return {}
    if isinstance(anchor_date, datetime.datetime):
        now = anchor_date
    else:
        now = timezone.make_aware(datetime.datetime.combine(anchor_date, datetime.time(12)))
    first = lessons[0]
    today = timezone.localdate(now)
    schedule = student.recurring_schedules.filter(teacher=teacher, active=True).first()
    weekday = schedule.day_of_week if schedule else today.weekday()
    latest_past = today - datetime.timedelta(days=(today.weekday() - weekday) % 7 or 7)
    completed = [lesson for lesson in lessons if lesson.status == 'completed']
    for index, lesson in enumerate(completed):
        lesson.date = timezone.make_aware(datetime.datetime.combine(
            latest_past - datetime.timedelta(weeks=len(completed) - index - 1),
            schedule.start_time if schedule else datetime.time(18),
        ))
        lesson.save(update_fields=['date', 'updated_at'])
    prefix = f'mobile-demo/{student.pk}'
    lesson_pdf = save_fixture(f'{prefix}/guia-de-estudos.pdf', pdf_bytes(
        f'English study guide - {student.level}',
        ['LOCAL DEMONSTRATION MATERIAL', f'Student: {student.name}',
         '1. Read the notes from your latest lesson.',
         '2. Say three sentences using your new vocabulary.',
         '3. Review your flashcards and complete your homework.',
         '4. Write a short paragraph about your next goal.',
         'These files contain fictional data for interface testing.'],
    ))
    diagram = f'''<svg xmlns="http://www.w3.org/2000/svg" width="720" height="340" viewBox="0 0 720 340">
<rect width="720" height="340" rx="28" fill="#edf5f2"/>
<text x="36" y="55" fill="#14243a" font-family="Arial" font-size="24" font-weight="bold">Your English practice - {escape(student.level or '')}</text>
<text x="36" y="85" fill="#5b6c77" font-family="Arial" font-size="16">Local demo study material</text>
<g font-family="Arial" font-size="20" text-anchor="middle">
<rect x="36" y="130" width="192" height="120" rx="20" fill="white"/><text x="132" y="180" fill="#137c78">READ</text><text x="132" y="212" fill="#5b6c77" font-size="16">Lesson notes</text>
<rect x="264" y="130" width="192" height="120" rx="20" fill="white"/><text x="360" y="180" fill="#137c78">SPEAK</text><text x="360" y="212" fill="#5b6c77" font-size="16">Try new words</text>
<rect x="492" y="130" width="192" height="120" rx="20" fill="white"/><text x="588" y="180" fill="#137c78">REVIEW</text><text x="588" y="212" fill="#5b6c77" font-size="16">Build confidence</text>
</g><text x="36" y="300" fill="#5b6c77" font-family="Arial" font-size="14">Small steps, every day.</text></svg>'''
    image = save_fixture(f'{prefix}/study-map.svg', diagram.encode())
    audio_names = {}
    for kind in ['listening', 'speaking']:
        audio_names[kind] = save_fixture(f'mobile-demo/audio/{kind}.wav', (Path(__file__).parent / 'demo_assets' / f'{kind}.wav').read_bytes())
    for index, name in enumerate([lesson_pdf, image, audio_names['listening']]):
        Attachment.objects.get_or_create(id=demo_id(student, f'attachment-{index}'), defaults={'lesson': first, 'file': name})
    image_url = default_storage.url(image)
    if image_url not in (first.notes or ''):
        first.notes = (first.notes or '') + f'<h3>Mapa de estudo</h3><p>Material de demonstração para praticar leitura, fala e revisão.</p><p><img src="{image_url}" alt="Mapa de estudo: ler, falar e revisar" /></p>'
        first.save(update_fields=['notes', 'updated_at'])
    question = HomeworkQuestion.objects.filter(homework__student=student, homework__status='pending').order_by('order').first()
    if question:
        question.image = image
        question.save(update_fields=['image'])

    _seed_finance(student, teacher, now, lesson_pdf)
    _seed_saved_sessions(student, first, now, audio_names)
    for index, (title, price, free) in enumerate([
        ('Guia de estudos e organização [DEMO]', '0.00', True),
        ('English for Travel [DEMO]', '49.90', False),
        ('Business Communication [DEMO]', '89.90', False),
    ]):
        Course.objects.get_or_create(
            id=demo_id(teacher, f'course-{index}'),
            defaults={'title': title, 'description': 'Curso fictício para testar o catálogo local. Nenhuma compra ou cobrança será realizada.', 'price': Decimal(price), 'is_free': free, 'created_by': teacher},
        )
    return {'attachments': 3, 'saved_ai_sessions': 4}


def _seed_finance(student, teacher, now, contract):
    FinancialSettings.objects.get_or_create(teacher=teacher, defaults={
        'default_monthly_fee': Decimal('450.00'), 'pix_key': '',
        'payment_instructions': 'Ambiente de demonstração. Não realize pagamentos reais.',
    })
    profile = student.finance_profile
    profile.contract_file = contract
    profile.contract_name = 'Guia/contrato demonstrativo - sem validade comercial.pdf'
    profile.save(update_fields=['contract_file', 'contract_name', 'updated_at'])
    today = timezone.localdate(now)
    month = today.replace(day=1)
    previous = (month - datetime.timedelta(days=1)).replace(day=1)
    Payment.objects.get_or_create(student=student, reference_month=previous, defaults={
        'teacher': teacher, 'finance_profile': profile, 'amount': profile.monthly_fee,
        'due_date': previous.replace(day=10), 'status': 'paid',
        'paid_at': now - datetime.timedelta(days=30), 'confirmed_at': now - datetime.timedelta(days=29),
        'notes': 'Pagamento fictício confirmado para teste de histórico.',
    })
    status = {'bruno': 'awaiting_confirmation', 'carla': 'overdue', 'diego': 'paid'}.get(student.email.split('@')[0], 'pending')
    current, _ = Payment.objects.get_or_create(student=student, reference_month=month, defaults={
        'teacher': teacher, 'finance_profile': profile, 'amount': profile.monthly_fee,
    })
    current.status = status
    current.due_date = today + datetime.timedelta(days=-3 if status == 'overdue' else 5)
    current.notes = 'Registro fictício da base local. Não efetue pagamento.'
    if status == 'paid':
        current.paid_at = now - datetime.timedelta(days=2)
        current.confirmed_at = now - datetime.timedelta(days=1)
    if status == 'awaiting_confirmation':
        current.receipt_submitted_at = now - datetime.timedelta(hours=2)
    current.save()
    if status == 'awaiting_confirmation':
        PaymentReceipt.objects.get_or_create(id=demo_id(student, 'receipt'), defaults={
            'payment': current, 'uploaded_by': student, 'file': contract,
            'original_name': 'comprovante-ficticio.pdf', 'review_status': 'pending',
        })
    FinancialTimelineEntry.objects.get_or_create(id=demo_id(student, 'finance-timeline'), defaults={
        'teacher': teacher, 'student': student, 'payment': current, 'event_type': 'note_added',
        'title': 'Base de testes preparada', 'description': 'Todos os valores e documentos desta conta são fictícios.',
    })


def _seed_saved_sessions(student, lesson, now, audio_names):
    level = 'A2' if student.level == 'A1/A2' else student.level
    transcript = 'I have been practising English every day. I feel more confident when I speak with my teacher.'
    for index, (mode, title) in enumerate([
        ('review', 'Revisão da última aula [DEMO]'),
        ('speaking', 'Minha evolução no inglês [DEMO]'),
        ('writing', 'Uma mensagem para o professor [DEMO]'),
        ('listening', 'Horário da próxima aula [DEMO]'),
    ]):
        session, created = AIStudySession.objects.get_or_create(id=demo_id(student, f'ai-{mode}'), defaults={
            'student': student, 'lesson': lesson, 'mode': mode, 'theme': 'minhas_aulas', 'title': title,
            'is_pinned': mode == 'review', 'status': 'completed', 'streaming_ready': False,
            'last_interaction_at': now - datetime.timedelta(days=index + 1),
            'guided_state': {'enabled': False, 'stage': 'active', 'level': level, 'session_status': 'completed', 'scenario_key': 'class', 'scenario_label': 'Na aula de inglês', 'demo': True},
        })
        if not created:
            continue
        AIContextLesson.objects.create(session=session, lesson=lesson, snapshot={'title': lesson.title, 'level': student.level, 'notes': lesson.notes or ''})
        if mode == 'speaking':
            with wave.open(io.BytesIO((Path(__file__).parent / 'demo_assets' / 'speaking.wav').read_bytes())) as wav:
                duration = Decimal(str(round(wav.getnframes() / wav.getframerate(), 2)))
            audio = SpeakingAudio.objects.create(session=session, student=student, audio=audio_names['speaking'], mime_type='audio/wav', duration_seconds=duration, status='analyzed')
            feedback = SpeakingFeedback.objects.create(
                session=session, audio=audio, transcript=transcript, overall_score=86, estimated_level=level,
                pronunciation_score=88, fluency_score=84, intonation_score=85, clarity_score=90,
                grammar_score=87, vocabulary_score=86, ai_feedback='Feedback demonstrativo: fala clara e bem organizada. Continue praticando pausas naturais.',
                corrected_sentence=transcript, natural_sentence=transcript,
                correct_words=['practising', 'confident', 'teacher'], problem_words=['every'],
                pronunciation_mistakes=['Treine a ligação entre every e day.'],
                improvement_tips=['Leia a frase em voz alta e marque as palavras importantes.'],
                practice_exercises=['Repita a frase uma vez lentamente e outra em ritmo natural.'],
                vocabulary_suggestions=['confidence', 'improvement'], tts_audio_url=default_storage.url(audio_names['speaking']), raw_response={'demo': True},
            )
            AIConversationMessage.objects.create(session=session, role='user', content_type='audio', text=transcript, audio=audio)
            AIConversationMessage.objects.create(session=session, role='assistant', content_type='feedback', text=feedback.ai_feedback, feedback=feedback)
        elif mode == 'writing':
            original = 'Hello teacher! I study English every days. I want improve my speaking.'
            corrected = 'Hello, teacher! I study English every day. I want to improve my speaking.'
            feedback = WritingFeedback.objects.create(
                session=session, student=student, text_type='email', original_text=original, corrected_text=corrected,
                estimated_level=level, writing_score=82, sub_scores={'grammar': 80, 'vocabulary': 85, 'coherence': 84},
                general_feedback='Exemplo salvo para testar a revisão de escrita.', level_progress_feedback='Organize uma ideia por frase.',
                strengths=['Objetivo da mensagem claro.'], improvement_tips=['Use every day no singular.', 'Use to antes do verbo depois de want.'],
                error_explanations=[{'excerpt': 'every days', 'corrected': 'every day', 'category': 'Expressões de tempo', 'explanation': 'A expressão every day usa day no singular.'}],
                grammar_breakdown=['Want + to + verbo na forma base.'], raw_response={'demo': True},
            )
            AIConversationMessage.objects.create(session=session, role='user', content_type='text', text=original)
            AIConversationMessage.objects.create(session=session, role='assistant', content_type='writing_feedback', text=feedback.general_feedback, writing_feedback=feedback)
        elif mode == 'listening':
            session.guided_state.update({'listening_journey': {'steps': [{'id': 'class-time', 'label': 'Entender dia e horário'}], 'current_step_index': 0, 'completed_step_ids': ['class-time']}, 'progress_summary': 'Exemplo de listening concluído.'})
            session.save(update_fields=['guided_state', 'updated_at'])
            challenge = AIConversationMessage.objects.create(session=session, role='assistant', text='Ouça o aviso e identifique quando será a aula.', metadata={
                'mode': 'listening', 'interpreter': True, 'interpreter_exercise': {
                    'id': str(demo_id(student, 'listening-exercise')), 'round': 1, 'scenario_key': 'class', 'scenario_label': 'Na aula de inglês', 'level': level,
                    'instructions': 'Ouça e escolha o dia e o horário da aula.',
                    'tts_audio_url': default_storage.url(audio_names['listening']), 'tts_unavailable': False,
                    'options': [{'id': 'a', 'text': 'Tuesday at nine thirty'}, {'id': 'b', 'text': 'Thursday at nine thirty'}, {'id': 'c', 'text': 'Thursday at ten thirty'}],
                    'correct_option_id': 'b', 'focus_words': ['Thursday', 'nine thirty', 'notebook'],
                    'step_id': 'class-time', 'step_title': 'Entender dia e horário', 'step_index': 1, 'step_total': 1, 'is_final_step': True,
                    'response_mode_choices': [{'id': 'multiple_choice', 'label': 'Com alternativas'}, {'id': 'transcription', 'label': 'Escrever sozinho'}],
                },
            })
            AIConversationMessage.objects.create(session=session, role='user', text='Thursday at nine thirty', metadata={'challenge_message_id': str(challenge.id), 'interpreter_response_mode': 'multiple_choice'})
            AIConversationMessage.objects.create(session=session, role='assistant', text='Isso mesmo! A aula será na quinta-feira às nove e meia.', metadata={'interpreter_feedback': {'challenge_message_id': str(challenge.id), 'response_mode': 'multiple_choice', 'selected_option_id': 'b', 'status': 'correct', 'is_correct': True, 'similarity_score': 100}})
        else:
            AIConversationMessage.objects.create(session=session, role='assistant', text=f'Vamos revisar a aula {lesson.title}. Conte algo que você aprendeu e use duas palavras novas.')
            AIConversationMessage.objects.create(session=session, role='user', text='I reviewed my notes and practised the new vocabulary with a friend.')
            AIConversationMessage.objects.create(session=session, role='assistant', text='Boa estratégia! Exemplo de revisão salvo para explorar a interface sem chamadas externas.')
