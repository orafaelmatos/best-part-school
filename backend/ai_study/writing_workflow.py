"""A single active exercise, contextual help, and evidence-backed Writing reports."""

from django.utils import timezone
from openai import OpenAIError
from rest_framework.exceptions import APIException, ValidationError

from . import writing
from .guided_tutor import build_choice, build_guided_metadata, guided_session_title, unique_items, SUMMARY_ACTIONS
from .models import WritingFeedback, WritingSessionReport


class WritingContentUnavailable(APIException):
    status_code = 503
    default_detail = 'Não consegui preparar a atividade de Writing agora. Tente novamente; seu progresso foi preservado.'


def mode_prompt():
    choices = [build_choice(key, label, key, 'writing_mode', variant='card')
               for key, (label, _) in writing.PRACTICE_MODES.items()]
    return 'Como você quer praticar Writing? Vou ensinar a estrutura e mostrar um exemplo antes da sua vez.', build_guided_metadata(
        stage='choose_writing_mode', choices=choices, layout='grid', expected_input='choice',
        input_placeholder='Escolha uma forma de praticar.',
        helper_text='Todas as opções serão adaptadas ao seu cenário e nível.',
    )


class WritingWorkflow:
    def __init__(self, session, state):
        # Imported lazily because the shared workflow dispatches to this class.
        from .services import AIStudyWorkflowService, AIStudyOpenAIService
        self.session, self.state = session, state
        self.workflow, self.ai = AIStudyWorkflowService, AIStudyOpenAIService

    @property
    def engine(self):
        return self.state.get('writing')

    def persist(self, status='active'):
        self.workflow.persist_guided_state(
            self.session, self.state, status=status,
            title=guided_session_title('writing', self.state.get('scenario_label')), touch=True,
        )

    def message(self, text, **metadata):
        return self.workflow._assistant_message(self.session, text, {'mode': 'writing', **metadata})

    def generate(self, *, simulation=False):
        kind = 'dialogue' if simulation else writing.choose_kind(self.engine, self.state['level'])
        error = ''
        for attempt in range(2):
            try:
                result = self.ai.generate_writing_activity(self.session, self.state, kind, error)
                activity = writing.validate_activity(result, kind, self.state['level'], self.engine['focus_structure'])
                break
            except ValueError as exc:
                error = str(exc)[:1000]
                if attempt:
                    raise WritingContentUnavailable() from exc
            except OpenAIError as exc:
                raise WritingContentUnavailable() from exc
        self.engine.update(activity=activity, activity_answered=False)
        self.state.update(stage='active', session_status='active', current_task=activity['instruction'],
                          expected_input='text_submission', input_placeholder='Escreva sua resposta em inglês. Você pode pedir ajuda.',
                          objective=activity['objective'], last_activity_type=kind)

    def activity_message(self, *, text='Sua vez! Use o exemplo para construir sua resposta.', correction=None, help_action=None):
        self.state.update(stage='active', session_status='active', current_task=self.engine['activity']['instruction'],
                          expected_input='text_submission', input_placeholder='Escreva sua resposta em inglês. Você pode pedir ajuda.')
        choices = [build_choice(key, label, key, 'writing_help') for key, label in writing.HELP_LABELS.items()]
        choices += [build_choice('continue', 'Continuar', 'continue', 'quick_action', variant='primary'),
                    build_choice('simulation', 'Simular situação', 'simulation', 'quick_action'),
                    build_choice('change_practice', 'Trocar atividade', 'change_practice', 'quick_action'),
                    build_choice('change_scenario', 'Mudar cenário', 'change_scenario', 'session_control'),
                    build_choice('end_session', 'Finalizar prática', 'end_session', 'session_control')]
        metadata = build_guided_metadata(
            stage='active', choices=choices, expected_input='text_submission',
            current_task=self.state['current_task'], input_placeholder=self.state['input_placeholder'],
            helper_text='Responda à atividade atual ou escolha uma ajuda.',
        )
        metadata['writing_activity'] = writing.public_activity(self.engine)
        if correction:
            metadata['writing_correction'] = correction
        if help_action:
            metadata['writing_help'] = {
                'action': help_action,
                'label': 'Simular situação' if help_action == 'simulation' else writing.HELP_LABELS[help_action],
                'text': self.engine['activity']['simulation'] if help_action == 'simulation' else writing.help_text(self.engine['activity'], help_action),
            }
        self.persist()
        return self.message(text, **metadata)

    def report(self, status='active'):
        feedbacks = list(self.session.writing_feedbacks.filter(
            raw_response__writing_run_id=self.engine['run_id'],
        ).order_by('created_at'))
        activities = {item.raw_response['activity']['id'] for item in feedbacks}
        correct = sum(item.raw_response['evaluation']['outcome'] == 'correct' for item in feedbacks)
        structures = unique_items([item.raw_response['activity']['structure'] for item in feedbacks], limit=1000)
        vocabulary = unique_items([word for item in feedbacks for word in item.raw_response['evaluation']['used_vocabulary']], limit=1000)
        difficulties = unique_items([error['explanation'] for item in feedbacks for error in item.error_explanations], limit=1000)
        recommendations = unique_items([item.raw_response['evaluation']['review'] for item in feedbacks], limit=1000)
        report = {
            'version': 1, 'run_id': self.engine['run_id'], 'scenario': self.state['scenario_label'],
            'level': self.state['level'], 'practice_mode': writing.PRACTICE_MODES[self.engine['practice_mode']][0],
            'status': status, 'activities_completed': len(activities), 'attempts': len(feedbacks),
            'correct': correct, 'needs_work': len(feedbacks) - correct,
            'structures': structures, 'vocabulary': vocabulary, 'difficulties': difficulties,
            'recommendations': recommendations or ['Faça uma atividade para receber sugestões baseadas na sua escrita.'],
            'responses': [{'original': item.original_text, 'corrected': item.corrected_text,
                           'outcome': item.raw_response['evaluation']['outcome'],
                           'activity': item.raw_response['activity']['kind_label'],
                           'instruction': item.raw_response['activity']['instruction'],
                           'feedback': item.general_feedback, 'errors': item.error_explanations}
                          for item in feedbacks],
        }
        previous = WritingSessionReport.objects.filter(session=self.session, run_id=self.engine['run_id']).first()
        WritingSessionReport.objects.update_or_create(session=self.session, run_id=self.engine['run_id'], defaults={
            'status': status, 'report': report,
            'completed_at': (previous.completed_at if previous and previous.completed_at else timezone.now()) if status == 'completed' else None,
        })
        self.state['learned_words'] = vocabulary[:18]
        self.state['recurring_errors'] = difficulties[:18]
        return report

    def summary(self, finalize=False):
        report = self.report('completed' if finalize else 'paused')
        self.state.update(stage='completed' if finalize else 'summary', session_status='completed' if finalize else 'summary',
                          expected_input='choice', current_task='', input_placeholder='Escolha o próximo passo.')
        self.persist('completed' if finalize else 'active')
        choices = [build_choice('new_scenario', 'Novo cenário', 'new_scenario', 'session_control')] if finalize else SUMMARY_ACTIONS
        return self.message('Prática finalizada.' if finalize else 'Veja o que você praticou nesta aula.', writing_report=report,
                            **build_guided_metadata(stage=self.state['stage'], choices=choices, expected_input='choice'))

    def handle(self, text='', action=None):
        action = action or {}
        value, action_type = action.get('value', ''), action.get('action_type', '')
        if self.session.status == 'completed' and value not in {'new_scenario', 'change_scenario', 'finalize_session'}:
            raise ValidationError('Esta prática está encerrada. Escolha um novo cenário para continuar.')
        if value in {'change_scenario', 'new_scenario'}:
            if self.engine and self.session.status != 'completed':
                self.report('paused')
            self.state.update(stage='choose_scenario', preserve_level_on_scenario_change=True,
                              current_task='', expected_input='choice')
            self.state.pop('writing', None)
            self.persist()
            from .guided_tutor import scenario_prompt_message
            prompt, metadata = scenario_prompt_message()
            return self.message(prompt, **metadata)
        if self.engine and value in {'end_session', 'finalize_session'}:
            return self.summary(finalize=True)
        if self.engine and value == 'review_summary':
            self.engine['support'] = 'full'
            self.state.update(stage='active', session_status='active')
            return self.activity_message(text='Vamos revisar a estrutura com apoio completo.', help_action='grammar')
        if value == 'change_practice':
            if self.engine:
                self.report('paused')
            self.state.update(stage='choose_writing_mode', expected_input='choice')
            self.persist()
            prompt, metadata = mode_prompt()
            return self.message(prompt, **metadata)
        if self.state.get('stage') == 'choose_writing_mode' or not self.engine:
            mode = value if action_type == 'writing_mode' else next((key for key, (label, _) in writing.PRACTICE_MODES.items() if text.casefold() in {key, label.casefold()}), '')
            if mode not in writing.PRACTICE_MODES:
                self.state.update(stage='choose_writing_mode', current_task='', expected_input='choice',
                                  input_placeholder='Escolha uma forma de praticar Writing.')
                self.persist()
                prompt, metadata = mode_prompt()
                return self.message(prompt, **metadata)
            self.state['writing'] = writing.start(mode)
            self.generate()
            self.report()
            return self.activity_message()
        if value == 'continue_session':
            self.state.update(stage='active', session_status='active')
        if action_type == 'writing_help' and value in writing.HELP_LABELS:
            return self.activity_message(text='Vamos resolver a mesma atividade juntos.', help_action=value)
        if value in {'vocabulary', 'grammar', 'example', 'hint', 'starter', 'simplify', 'retry'}:
            return self.activity_message(help_action=value if value in writing.HELP_LABELS else None)
        if value == 'simulation' and not self.engine['activity_answered']:
            return self.activity_message(help_action='simulation')
        if value in {'continue', 'continue_session', 'new_challenge', 'exercise', 'increase_difficulty', 'simulation'}:
            if not self.engine['activity_answered']:
                # Continuing and asking for a simulation cannot silently replace an unanswered task.
                return self.activity_message(text='Continue nesta situação: responda à atividade abaixo. Se precisar, escolha uma ajuda.', help_action='starter')
            self.engine['activity_index'] += 1
            self.generate(simulation=value == 'simulation')
            return self.activity_message()
        if action:
            raise ValidationError('Escolha uma opção disponível para a atividade atual.')
        if self.state.get('stage') in {'summary', 'completed'}:
            return self.summary()
        if self.engine['activity_answered']:
            self.engine['activity_index'] += 1
            self.generate()
            return self.activity_message()
        return self.evaluate(text)

    def evaluate(self, text):
        error = ''
        for attempt in range(2):
            try:
                evaluation = writing.validate_evaluation(self.ai.evaluate_writing_activity(self.session, self.state, text, error), text)
                break
            except ValueError as exc:
                error = str(exc)[:1000]
                if attempt:
                    raise WritingContentUnavailable() from exc
            except OpenAIError as exc:
                raise WritingContentUnavailable() from exc
        if evaluation['outcome'] == 'help':
            return self.activity_message(text=evaluation['feedback'], help_action=evaluation['help_action'])
        activity = self.engine['activity']
        correct = evaluation['outcome'] == 'correct'
        WritingFeedback.objects.create(
            session=self.session, student=self.session.student, original_text=text,
            corrected_text=evaluation['corrected_text'], estimated_level=self.state['level'],
            writing_score=100 if correct else 0, general_feedback=evaluation['feedback'],
            error_explanations=evaluation['errors'], grammar_breakdown=[activity['structure']],
            improvement_tips=[evaluation['review']] if evaluation['review'] else [],
            raw_response={'writing_run_id': self.engine['run_id'], 'activity': activity, 'evaluation': evaluation},
        )
        correction = {'original': text, **evaluation}
        self.engine['last_feedback'] = correction
        self.engine['activity_answered'] = True
        self.engine['success_streak'] = self.engine['success_streak'] + 1 if correct else 0
        self.engine['support'] = 'light' if self.engine['success_streak'] >= 3 else 'full'
        self.engine['focus_structure'] = '' if self.engine['success_streak'] >= 3 else activity['structure']
        self.state['progress_summary'] = evaluation['feedback']
        self.report()
        self.engine['activity_index'] += 1
        try:
            self.generate()
        except WritingContentUnavailable:
            # Preserve the evaluated response even if the next generation is temporarily unavailable.
            self.engine['activity_index'] -= 1
            self.state.update(current_task='', expected_input='choice', input_placeholder='Use Continuar para preparar a próxima atividade.')
            self.persist()
            return self.message('Sua resposta foi salva. Use Continuar para preparar a próxima atividade.',
                                writing_correction=correction,
                                **build_guided_metadata(stage='active', expected_input='choice', choices=[
                                    build_choice('continue', 'Continuar', 'continue', 'quick_action', variant='primary'),
                                    build_choice('end_session', 'Finalizar prática', 'end_session', 'session_control'),
                                ]))
        return self.activity_message(text='Vamos praticar mais uma vez.', correction=correction)
