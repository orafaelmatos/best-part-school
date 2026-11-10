from copy import deepcopy
from types import SimpleNamespace
from unittest.mock import patch
import json

from django.test import SimpleTestCase

from . import speaking_feedback
from .services import AIStudyOpenAIService


def feedback_payload(_session=None, transcript='My name is Gabriel.', *, language='pt-BR', previous=None, target=''):
    suggested = target or transcript
    return {
        'summary': 'Sua frase funciona neste contexto.', 'suggested_sentence': suggested,
        'suggested_translation': 'Meu nome é Gabriel.',
        'comments': ['Continue a conversa com essa frase.'],
        'grammar': {'status': 'correct', 'explanation': 'A construção está correta.'},
        'naturalness': {'status': 'natural' if suggested == transcript else 'alternative', 'explanation': 'Você pode usar essa forma.'},
        'changes': [] if suggested == transcript else [{'before': transcript, 'after': suggested, 'kind': 'naturalness', 'explanation': 'Vamos praticar a frase do exemplo.'}],
        'needs_clarification': False, 'clarification_question': '',
        'comparison': 'Você manteve a estrutura da tentativa anterior.' if previous else '',
    }


class SpeakingFeedbackContractTests(SimpleTestCase):
    def test_valid_alternatives_do_not_require_correction(self):
        for phrase in ['I would like a coffee.', "I'd like a coffee.", 'Can I have a coffee?']:
            result = speaking_feedback.validate(feedback_payload(transcript=phrase), phrase)
            self.assertEqual(result['suggested_sentence'], phrase)
            self.assertEqual(result['changes'], [])

    def test_real_reordering_is_naturalness_not_a_grammar_error(self):
        original = 'I would like a coffee, please, with no sugar, with milk.'
        suggested = "I'd like a coffee with milk, but no sugar, please."
        payload = feedback_payload(transcript=original, target=suggested)
        payload['changes'][0]['explanation'] = 'Organizamos as informações para deixar o pedido mais natural.'
        result = speaking_feedback.validate(payload, original)
        self.assertEqual(result['grammar']['status'], 'correct')
        self.assertEqual(result['naturalness']['status'], 'alternative')
        payload['changes'][0]['kind'] = 'grammar'
        with self.assertRaises(ValueError):
            speaking_feedback.validate(payload, original)

    def test_invented_changes_and_unexplained_rewrites_are_rejected(self):
        original = 'I like coffee.'
        payload = feedback_payload(transcript=original, target='I enjoy coffee.')
        payload['changes'][0]['before'] = 'I likes coffee.'
        with self.assertRaises(ValueError):
            speaking_feedback.validate(payload, original)
        payload['changes'] = []
        with self.assertRaises(ValueError):
            speaking_feedback.validate(payload, original)

    def test_ambiguous_meaning_requires_a_question_and_removes_guessed_corrections(self):
        payload = feedback_payload(transcript='Coffee no yes milk.')
        payload.update(needs_clarification=True, clarification_question='Você quer o café com ou sem leite?')
        result = speaking_feedback.validate(payload, 'Coffee no yes milk.')
        self.assertEqual(result['suggested_sentence'], '')
        self.assertEqual(result['changes'], [])
        self.assertEqual(result['grammar']['status'], 'not_assessed')
        payload['clarification_question'] = ''
        with self.assertRaises(ValueError):
            speaking_feedback.validate(payload, 'Coffee no yes milk.')

    def test_chunks_reconstruct_the_exact_saved_sentence(self):
        phrase = "I'd like a coffee with milk, but no sugar, please."
        parts = speaking_feedback.chunks(phrase)
        self.assertGreater(len(parts), 1)
        self.assertEqual(' '.join(parts), phrase)
        self.assertTrue(all(len(part.split()) <= 6 for part in parts))
        self.assertEqual(speaking_feedback.chunks('Thank you!'), [])

    def test_schema_does_not_ask_for_acoustic_scores_or_claims(self):
        properties = AIStudyOpenAIService.pronunciation_schema['schema']['properties']
        for name in ['pronunciation_score', 'intonation_score', 'fluency_score', 'pronunciation_mistakes']:
            self.assertNotIn(name, properties)

    @patch('ai_study.services.AIStudyWorkflowService.ensure_guided_state', return_value={})
    @patch.object(AIStudyOpenAIService, '_speaking_json')
    def test_provider_retries_invalid_changes_and_defaults_to_portuguese(self, provider, _state):
        invalid = feedback_payload(transcript='I like coffee.', target='I enjoy coffee.')
        invalid['changes'][0]['before'] = 'I likes coffee.'
        provider.side_effect = [invalid, feedback_payload(transcript='I like coffee.')]
        result = AIStudyOpenAIService.analyze_speaking(SimpleNamespace(), 'I like coffee.')
        self.assertEqual(result['suggested_sentence'], 'I like coffee.')
        self.assertEqual(provider.call_count, 2)
        request = json.loads(provider.call_args.args[0][1]['content'])
        self.assertEqual(request['feedback_language'], 'pt-BR')
        self.assertTrue(request['validation_error'])
        self.assertIn('ONLY a transcript', provider.call_args.args[0][0]['content'])

    @patch('ai_study.services.AIStudyWorkflowService.ensure_guided_state', return_value={})
    @patch.object(AIStudyOpenAIService, '_speaking_json')
    def test_comparison_is_suppressed_for_different_practice_targets(self, provider, _state):
        previous = SimpleNamespace(transcript='My name is Ana.', raw_response={'practice_target': 'My name is Ana.'})
        provider.return_value = feedback_payload(transcript='With milk.', previous=previous, target='With milk.')
        result = AIStudyOpenAIService.analyze_speaking(SimpleNamespace(), 'With milk.', previous=previous, target='With milk.')
        self.assertEqual(result['comparison'], '')
