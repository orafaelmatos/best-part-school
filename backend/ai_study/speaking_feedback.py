"""Short, evidence-based feedback. This pipeline has no acoustic evaluator."""

import re
from typing import Literal

from pydantic import Field

from .speaking import Contract


class GrammarAssessment(Contract):
    status: Literal['correct', 'needs_work', 'not_assessed']
    explanation: str = Field(max_length=400)


class NaturalnessAssessment(Contract):
    status: Literal['natural', 'alternative', 'not_assessed']
    explanation: str = Field(max_length=400)


class Change(Contract):
    before: str = Field(min_length=1, max_length=2000)
    after: str = Field(min_length=1, max_length=2000)
    kind: Literal['grammar', 'naturalness']
    explanation: str = Field(min_length=1, max_length=300)


class OralFeedback(Contract):
    summary: str = Field(min_length=1, max_length=350)
    suggested_sentence: str = Field(max_length=2000)
    suggested_translation: str = Field(max_length=2500)
    comments: list[str] = Field(min_length=1, max_length=3)
    grammar: GrammarAssessment
    naturalness: NaturalnessAssessment
    changes: list[Change] = Field(max_length=3)
    needs_clarification: bool
    clarification_question: str = Field(max_length=300)
    comparison: str = Field(max_length=350)


def sentence(feedback):
    """One source of truth for the displayed sentence AND every TTS request."""
    raw = feedback.raw_response or {}
    if raw.get('feedback_version') == 1:
        return raw.get('suggested_sentence', '').strip()
    return (feedback.natural_sentence or feedback.native_alternative_sentence or feedback.corrected_sentence or '').strip()


def chunks(text):
    """Contiguous excerpts, never rewritten phrases or invented words."""
    parts = []
    for clause in re.split(r'(?<=[,;.!?])\s+', text.strip()):
        words = clause.split()
        while words:
            parts.append(' '.join(words[:6]))
            words = words[6:]
    if len(parts) > 1 and len(parts[-1].split()) <= 2 and len((parts[-2] + ' ' + parts[-1]).split()) <= 6:
        parts[-2:] = [parts[-2] + ' ' + parts[-1]]
    return parts if len(parts) > 1 else []


def validate(payload, transcript, *, target=''):
    result = OralFeedback.model_validate(payload).model_dump()
    suggested = result['suggested_sentence']
    if any(not comment.strip() or len(comment) > 250 for comment in result['comments']):
        raise ValueError('Use até três comentários curtos.')
    if result['needs_clarification']:
        if not result['clarification_question']:
            raise ValueError('Pergunte o que o aluno quis dizer.')
        result.update(suggested_sentence='', suggested_translation='', changes=[], comparison='')
        result['grammar'] = {'status': 'not_assessed', 'explanation': ''}
        result['naturalness'] = {'status': 'not_assessed', 'explanation': ''}
        return result
    if not suggested or not result['suggested_translation']:
        raise ValueError('A frase sugerida precisa de tradução.')
    if target and suggested != target:
        raise ValueError('Na repetição, preserve exatamente a frase praticada.')
    if not target and result['grammar']['status'] == 'correct' and result['naturalness']['status'] == 'natural' and suggested != transcript:
        raise ValueError('Preserve a frase quando ela já está correta e natural.')
    for change in result['changes']:
        if change['before'] not in transcript or change['after'] not in suggested or change['before'] == change['after']:
            raise ValueError('Explique apenas alterações reais, citando os dois textos exatamente.')
        if change['kind'] == 'grammar' and result['grammar']['status'] != 'needs_work':
            raise ValueError('Não trate uma alternativa natural como erro gramatical.')
    if suggested == transcript and result['changes']:
        raise ValueError('Uma frase preservada não contém correções.')
    if suggested != transcript and not result['changes']:
        raise ValueError('Explique o que mudou entre a fala e a sugestão.')
    if result['grammar']['status'] == 'needs_work' and not any(c['kind'] == 'grammar' for c in result['changes']):
        raise ValueError('Um erro gramatical precisa de evidência concreta.')
    return result


def unavailable(transcript, target='', language='pt-BR'):
    """Keep the recording and conversation usable if analysis is unavailable."""
    english = language == 'en'
    return {
        'summary': 'Feedback is unavailable right now. Your recording was saved.' if english else 'A análise não ficou disponível agora. Sua gravação foi salva.',
        'suggested_sentence': target or transcript, 'suggested_translation': '',
        'comments': ['Try again or continue the conversation.' if english else 'Você pode tentar novamente ou continuar a conversa.'],
        'grammar': {'status': 'not_assessed', 'explanation': ''},
        'naturalness': {'status': 'not_assessed', 'explanation': ''},
        'changes': [], 'needs_clarification': False, 'clarification_question': '', 'comparison': '',
        'analysis_unavailable': True,
    }


def public_details(feedback):
    raw = feedback.raw_response or {}
    details = {key: raw[key] for key in OralFeedback.model_fields if key in raw} if raw.get('feedback_version') == 1 else {}
    details.update({
        'feedback_version': raw.get('feedback_version', 0),
        'suggested_sentence': sentence(feedback),
        'full_sentence': raw.get('full_sentence') or sentence(feedback),
        'full_translation': raw.get('full_translation') or raw.get('suggested_translation', ''),
        'chunks': chunks(raw.get('full_sentence') or sentence(feedback)),
        'feedback_language': raw.get('feedback_language', 'pt-BR'),
        'previous_feedback_id': raw.get('previous_feedback_id'),
        'practice_target': raw.get('practice_target', ''),
        'analysis_unavailable': raw.get('analysis_unavailable', False),
        'pronunciation': {
            'status': 'not_assessed', 'source': 'transcript', 'score': None,
            'explanation': ('Pronunciation was not assessed. Sounds, stress, rhythm and intonation require audio analysis.'
                            if raw.get('feedback_language') == 'en' else
                            'Pronúncia não avaliada. Sons, sílabas tônicas, ritmo e entonação precisam de análise do áudio.'),
        },
    })
    return details
