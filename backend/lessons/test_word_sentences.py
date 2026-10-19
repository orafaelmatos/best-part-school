import json
from types import SimpleNamespace
from unittest.mock import patch

from django.test import TestCase, SimpleTestCase
from rest_framework.test import APIClient

from accounts.models import StudentGroup, User
from .models import Lesson, NewWord, VocabularyCard
from .vocabulary import sync_new_word_card
from .word_sentences import SentenceGenerationError, WordSentenceService


DRAFTS = [
    {'source_word': 'airport', 'sentence': 'We are at the airport.', 'translation': 'Estamos no aeroporto.'},
    {'source_word': 'achievement', 'sentence': 'This is a great achievement.', 'translation': 'Esta é uma grande conquista.'},
]


class WordSentenceWorkflowTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.teacher = User.objects.create_user(email='sentences-teacher@test.com', role='teacher', name='Teacher')
        cls.other_teacher = User.objects.create_user(email='sentences-other@test.com', role='teacher', name='Other')
        cls.admin = User.objects.create_user(email='sentences-admin@test.com', role='admin', name='Admin')
        cls.student = User.objects.create_user(email='sentences-student@test.com', role='student', name='Student')
        cls.lesson = Lesson.objects.create(title='Travel', level='A2', teacher=cls.teacher, student=cls.student)

    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(self.teacher)
        self.generate_url = f'/api/lessons/{self.lesson.pk}/generate-word-sentences/'
        self.approve_url = f'/api/lessons/{self.lesson.pk}/approve-word-sentences/'

    @patch('lessons.views.WordSentenceService.generate', return_value=DRAFTS)
    def test_generation_deduplicates_input_and_does_not_publish_cards(self, generate):
        response = self.client.post(self.generate_url, {'words': [' airport ', 'Airport', 'achievement']}, format='json')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['items'], DRAFTS)
        self.assertEqual(generate.call_args.args[0], self.lesson)
        self.assertEqual(generate.call_args.args[1], ['airport', 'achievement'])
        self.assertFalse(NewWord.objects.exists())
        self.assertFalse(VocabularyCard.objects.exists())

    @patch('ai_study.services.client')
    def test_nonliteral_suggestion_returns_batch_for_review_instead_of_503(self, client):
        client.with_options.return_value.chat.completions.create.return_value = SimpleNamespace(
            choices=[SimpleNamespace(
                finish_reason='stop',
                message=SimpleNamespace(refusal=None, content=json.dumps({'items': [
                    {'index': 0, 'sentence': DRAFTS[0]['sentence'], 'translation': DRAFTS[0]['translation']},
                    {'index': 1, 'sentence': 'She took her shoes off.', 'translation': 'Ela tirou os sapatos.'},
                ]})),
            )],
        )
        response = self.client.post(self.generate_url, {'words': ['airport', 'take off']}, format='json')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data['items']), 2)
        self.assertNotIn('review_warning', response.data['items'][0])
        self.assertEqual(response.data['items'][1]['source_word'], 'take off')
        self.assertTrue(response.data['items'][1]['review_warning'])
        self.assertFalse(NewWord.objects.exists())
        self.assertFalse(VocabularyCard.objects.exists())

    @patch('lessons.views.WordSentenceService.generate')
    def test_invalid_word_lists_are_rejected_before_generation(self, generate):
        for words in ([], [' '], ['a' * 101], ['word'] * 51, 'airport'):
            with self.subTest(words=words):
                response = self.client.post(self.generate_url, {'words': words}, format='json')
                self.assertEqual(response.status_code, 400)
        generate.assert_not_called()

    @patch('lessons.views.WordSentenceService.generate', side_effect=SentenceGenerationError('Missing item'))
    def test_failed_generation_does_not_save_partial_results(self, generate):
        response = self.client.post(self.generate_url, {'words': ['airport']}, format='json')
        self.assertEqual(response.status_code, 503)
        self.assertFalse(NewWord.objects.exists())
        self.assertFalse(VocabularyCard.objects.exists())

    def test_both_actions_require_authentication(self):
        self.client.force_authenticate(None)
        for url in (self.generate_url, self.approve_url):
            self.assertEqual(self.client.post(url, {}, format='json').status_code, 401)

    @patch('lessons.views.WordSentenceService.generate')
    def test_students_and_other_teachers_cannot_generate_or_approve(self, generate):
        for user in (self.student, self.other_teacher):
            self.client.force_authenticate(user)
            for url in (self.generate_url, self.approve_url):
                with self.subTest(user=user.role, url=url):
                    response = self.client.post(url, {'words': ['airport'], 'items': DRAFTS}, format='json')
                    self.assertIn(response.status_code, (403, 404))
        generate.assert_not_called()
        self.assertFalse(NewWord.objects.exists())

    @patch('lessons.views.WordSentenceService.generate')
    def test_templates_and_lessons_without_students_cannot_publish_cards(self, generate):
        for is_template in (True, False):
            lesson = Lesson.objects.create(title='Unassigned', level='A2', teacher=self.teacher, is_template=is_template)
            for action in ('generate-word-sentences', 'approve-word-sentences'):
                response = self.client.post(
                    f'/api/lessons/{lesson.pk}/{action}/', {'words': ['airport'], 'items': DRAFTS}, format='json',
                )
                self.assertEqual(response.status_code, 400)
        generate.assert_not_called()

    @patch('lessons.vocabulary.ensure_vocabulary_card_audio')
    def test_approval_saves_reviewed_sentence_and_translation_for_student(self, audio):
        edited = {**DRAFTS[0], 'sentence': 'I work at the airport.', 'translation': 'Eu trabalho no aeroporto.'}
        response = self.client.post(self.approve_url, {'items': [edited]}, format='json')

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['created_count'], 1)
        self.assertEqual(response.data['skipped_count'], 0)
        word = NewWord.objects.get()
        self.assertEqual(word.word, edited['sentence'])
        self.assertEqual(word.meaning, edited['translation'])
        self.assertEqual(word.level, self.lesson.level)
        card = VocabularyCard.objects.get(source_new_word=word)
        self.assertEqual(card.word, edited['sentence'])
        self.assertEqual(card.translation, edited['translation'])
        self.assertEqual(card.student, self.student)
        self.assertEqual(card.teacher, self.teacher)
        self.assertEqual(card.lesson, self.lesson)
        self.assertEqual(card.source_type, 'lesson')
        audio.assert_not_called()

        self.client.force_authenticate(self.student)
        queue = self.client.get('/api/vocabulary-cards/queue/')
        self.assertEqual(queue.status_code, 200)
        self.assertEqual(queue.data[0]['word'], edited['sentence'])
        self.assertEqual(queue.data[0]['translation'], edited['translation'])

    def test_approval_validates_entire_batch_before_saving(self):
        invalid_items = [
            [],
            [DRAFTS[0], {**DRAFTS[1], 'sentence': ' '}],
            [{**DRAFTS[0], 'sentence': 'a' * 256}],
            [{**DRAFTS[0], 'translation': ''}],
            [DRAFTS[0]] * 51,
        ]
        for items in invalid_items:
            with self.subTest(items=items):
                response = self.client.post(self.approve_url, {'items': items}, format='json')
                self.assertEqual(response.status_code, 400)
                self.assertFalse(NewWord.objects.exists())
                self.assertFalse(VocabularyCard.objects.exists())

    def test_repeated_approvals_and_repeated_sentences_do_not_duplicate_cards(self):
        response = self.client.post(self.approve_url, {'items': DRAFTS + [DRAFTS[0]]}, format='json')
        self.assertEqual(response.data['created_count'], 2)
        self.assertEqual(response.data['skipped_count'], 1)
        repeated = self.client.post(self.approve_url, {'items': DRAFTS}, format='json')
        self.assertEqual(repeated.data['created_count'], 0)
        self.assertEqual(repeated.data['skipped_count'], 2)
        self.assertEqual(NewWord.objects.count(), 2)
        self.assertEqual(VocabularyCard.objects.count(), 2)

    def test_existing_manual_cards_are_preserved(self):
        word = NewWord.objects.create(
            lesson=self.lesson, level='A2', word=DRAFTS[0]['sentence'].upper(), meaning='Tradução do professor',
        )
        response = self.client.post(self.approve_url, {'items': [DRAFTS[0]]}, format='json')
        self.assertEqual(response.data['skipped_count'], 1)
        word.refresh_from_db()
        self.assertEqual(word.meaning, 'Tradução do professor')

    def test_approval_for_group_lesson_creates_cards_for_every_student(self):
        second_student = User.objects.create_user(email='sentences-second@test.com', role='student', name='Second')
        group = StudentGroup.objects.create(name='Travel group', teacher=self.teacher)
        group.students.add(self.student, second_student)
        self.lesson.student = None
        self.lesson.group = group
        self.lesson.save()

        response = self.client.post(self.approve_url, {'items': DRAFTS}, format='json')
        self.assertEqual(response.status_code, 201)
        self.assertEqual(NewWord.objects.count(), 2)
        self.assertEqual(VocabularyCard.objects.count(), 4)
        for word in NewWord.objects.all():
            self.assertEqual(set(word.vocabulary_cards.values_list('student_id', flat=True)), {self.student.id, second_student.id})

    def test_admin_can_approve_cards_for_teacher_lesson(self):
        self.client.force_authenticate(self.admin)
        response = self.client.post(self.approve_url, {'items': [DRAFTS[0]]}, format='json')
        self.assertEqual(response.status_code, 201)
        self.assertEqual(VocabularyCard.objects.get().teacher, self.teacher)

    def test_sync_failure_rolls_back_entire_batch(self):
        def sync_then_fail(new_word, **kwargs):
            sync_new_word_card(new_word, **kwargs)
            if new_word.word == DRAFTS[1]['sentence']:
                raise RuntimeError('Card sync failed')

        with patch('lessons.views.sync_new_word_card', side_effect=sync_then_fail):
            with self.assertRaises(RuntimeError):
                self.client.post(self.approve_url, {'items': DRAFTS}, format='json')
        self.assertFalse(NewWord.objects.exists())
        self.assertFalse(VocabularyCard.objects.exists())


class WordSentenceGenerationTests(SimpleTestCase):
    def setUp(self):
        self.lesson = SimpleNamespace(title='Travel', level='A2')

    def completion(self, items, finish_reason='stop', refusal=None):
        return SimpleNamespace(choices=[SimpleNamespace(
            finish_reason=finish_reason,
            message=SimpleNamespace(content=json.dumps({'items': items}), refusal=refusal),
        )])

    @patch('ai_study.services.client')
    def test_generation_preserves_vocabulary_order_and_uses_lesson_level(self, client):
        client.with_options.return_value.chat.completions.create.return_value = self.completion([
            {'index': 1, 'sentence': DRAFTS[1]['sentence'], 'translation': DRAFTS[1]['translation']},
            {'index': 0, 'sentence': DRAFTS[0]['sentence'], 'translation': DRAFTS[0]['translation']},
        ])
        result = WordSentenceService.generate(self.lesson, ['airport', 'achievement'])
        self.assertEqual(result, DRAFTS)
        call = client.with_options.return_value.chat.completions.create.call_args.kwargs
        context = json.loads(call['messages'][1]['content'])
        self.assertEqual(context['level'], 'A2')
        self.assertEqual(context['lesson_topic'], 'Travel')
        self.assertTrue(call['response_format']['json_schema']['strict'])

    @patch('ai_study.services.client')
    def test_invalid_missing_and_refused_results_are_rejected(self, client):
        valid = {'index': 0, 'sentence': DRAFTS[0]['sentence'], 'translation': DRAFTS[0]['translation']}
        completions = [
            self.completion([]),
            self.completion([{**valid, 'translation': ''}]),
            self.completion([{**valid, 'sentence': 'airport ' * 40}]),
            self.completion([{**valid, 'index': True}]),
            self.completion([valid], finish_reason='length'),
            self.completion([valid], refusal='Refused'),
            SimpleNamespace(choices=[]),
        ]
        for completion in completions:
            with self.subTest(completion=completion):
                client.with_options.return_value.chat.completions.create.return_value = completion
                with self.assertRaises(SentenceGenerationError):
                    WordSentenceService.generate(self.lesson, ['airport'])

    @patch('ai_study.services.client')
    def test_partial_word_match_is_flagged_for_teacher_review(self, client):
        client.with_options.return_value.chat.completions.create.return_value = self.completion([
            {'index': 0, 'sentence': 'I learn English.', 'translation': 'Eu aprendo inglês.'},
        ])
        result = WordSentenceService.generate(self.lesson, ['ear'])
        self.assertEqual(result[0]['sentence'], 'I learn English.')
        self.assertTrue(result[0]['review_warning'])

    @patch('ai_study.services.client')
    def test_inflections_and_separable_expressions_do_not_discard_the_batch(self, client):
        client.with_options.return_value.chat.completions.create.return_value = self.completion([
            {'index': 0, 'sentence': 'She went home.', 'translation': 'Ela foi para casa.'},
            {'index': 1, 'sentence': 'Please turn the volume down.', 'translation': 'Por favor, abaixe o volume.'},
            {'index': 2, 'sentence': 'I don’t know.', 'translation': 'Eu não sei.'},
        ])

        result = WordSentenceService.generate(self.lesson, ['go', 'turn down', "don't"])

        self.assertEqual([item['source_word'] for item in result], ['go', 'turn down', "don't"])
        self.assertTrue(all(item['review_warning'] for item in result))

    @patch('ai_study.services.client')
    def test_literal_matches_ignore_case_and_whitespace_without_warning(self, client):
        client.with_options.return_value.chat.completions.create.return_value = self.completion([
            {'index': 0, 'sentence': 'We are at the AIRPORT.', 'translation': 'Estamos no aeroporto.'},
            {'index': 1, 'sentence': 'Please turn   down the music.', 'translation': 'Por favor, abaixe a música.'},
        ])

        result = WordSentenceService.generate(self.lesson, ['airport', 'turn down'])

        self.assertTrue(all('review_warning' not in item for item in result))
