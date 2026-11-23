"""Simulation continuity, help contracts and reversible vocabulary detours."""

from copy import deepcopy

from pydantic import Field

from . import speaking, speaking_preparation

HELP_ACTIONS = {'not_understood', 'hint', 'translate', 'examples', 'grammar'}
ACTION_LABELS = [
    ('continue', 'Continuar'), ('not_understood', 'Não entendi'), ('hint', 'Me dê uma dica'),
    ('translate', 'Ver tradução'), ('examples', 'Ver exemplos'), ('vocabulary', 'Aprender vocabulário'),
    ('grammar', 'Explicar gramática'), ('new_challenge', 'Novo desafio'),
]
RETURN_FIELDS = (
    'phase', 'step_index', 'completed_step_ids', 'completed_phases', 'phase_turns',
    'successful_turns', 'consecutive_difficulties', 'turn_count', 'last_question',
    'transition_reason', 'preparation',
)


class SuggestedResponse(speaking.Contract):
    text: str = Field(min_length=1)
    translation: str = Field(min_length=1)


class SimulationHelp(speaking.Contract):
    explanation: str
    translation: str
    hint: str
    examples: list[SuggestedResponse] = Field(max_length=3)
    grammar: str


def ensure(engine):
    updated = deepcopy(engine)
    updated.setdefault('simulation', {
        'version': 1, 'last_content': None, 'exchanges': [], 'branch_history': [],
        'success_streak': 0, 'support_level': 'full', 'return_point': None, 'challenge_history': [],
    })
    if updated['simulation']['last_content'] is None and updated['phase'] == 'SIMULATE' and updated['last_question']:
        content = {field: '' for field in speaking.TurnContent.model_fields}
        content['question'] = updated['last_question']
        updated['simulation']['last_content'] = content
    return updated


def record_help(engine, action):
    updated = ensure(engine)
    updated['help_used'] = (updated['help_used'] + [{
        'action': action, 'phase': updated['phase'], 'question': updated['last_question'],
        'turn': updated['turn_count'],
    }])[-60:]
    return updated


def remember(previous, updated, content, learner_input, action, observation, evidence):
    result = ensure(updated)
    simulation = result['simulation']
    if previous['phase'] == 'SIMULATE' and not action and observation in {'adequate', 'mastered', 'struggling', 'off_topic'}:
        step = speaking.current_situation(previous)['sequence'][previous['step_index']]
        exchange = {'step_id': step['id'], 'question': previous['last_question'],
                    'answer': learner_input, 'evidence': evidence}
        exchanges = simulation['exchanges'] + [exchange]
        # Preserve introductions and recent turns even when the DB history window moves on.
        simulation['exchanges'] = exchanges if len(exchanges) <= 24 else exchanges[:6] + exchanges[-18:]
        success = observation in {'adequate', 'mastered'}
        simulation['success_streak'] = simulation['success_streak'] + 1 if success else 0
        simulation['support_level'] = 'minimal' if simulation['success_streak'] >= 4 else 'light' if simulation['success_streak'] >= 2 else 'full'
        if success:
            target = 'END' if result['phase'] == 'FEEDBACK' else speaking.current_situation(result)['sequence'][result['step_index']]['id']
            simulation['branch_history'] = (simulation['branch_history'] + [{
                'from_step_id': step['id'], 'to_step_id': target, 'evidence': evidence,
            }])[-30:]
    if result['phase'] == 'SIMULATE':
        content = deepcopy(content)
        if simulation['support_level'] != 'full':
            content['response_starter'] = content['response_starter_translation'] = ''
        simulation['last_content'] = content
    return result


def validate_turn(previous, updated, payload):
    if previous['phase'] != 'SIMULATE':
        return
    success = payload['observation'] in {'adequate', 'mastered'}
    if success and not payload['next_step_id']:
        raise ValueError('Selecione explicitamente a ramificação coerente com a resposta do aluno.')
    if success and updated['phase'] == 'SIMULATE' and payload['content']['question'] == previous['last_question']:
        raise ValueError('A próxima etapa deve continuar o diálogo, sem reiniciar a mesma pergunta.')
    if updated['phase'] == 'FEEDBACK' and payload['content']['question']:
        raise ValueError('Encerre naturalmente a situação sem fazer outra pergunta.')


def validate_help(payload, action, level):
    result = SimulationHelp.model_validate(payload).model_dump()
    key = {'not_understood': 'explanation', 'hint': 'hint', 'translate': 'translation', 'grammar': 'grammar'}.get(action)
    if key and not result[key]:
        raise ValueError(f'A ajuda solicitada precisa preencher {key}.')
    if action == 'examples' and not 2 <= len(result['examples']) <= 3:
        raise ValueError('Forneça duas ou três respostas possíveis para a pergunta pendente.')
    if any(len(e['text'].split()) > speaking.level_policy(level)['phrase_words'] for e in result['examples']):
        raise ValueError('Os exemplos precisam respeitar o nível do aluno.')
    texts = [result[k] for k in ['explanation', 'translation', 'hint', 'grammar']]
    texts += [e['text'] + ' ' + e['translation'] for e in result['examples']]
    if sum(len(t.split()) for t in texts) > speaking.level_policy(level)['max_words'] * 2:
        raise ValueError('A ajuda precisa ser breve.')
    return result


def render_help(result, action):
    if action == 'examples':
        return '\n'.join(f"{e['text']} — {e['translation']}" for e in result['examples'])
    key = {'not_understood': 'explanation', 'hint': 'hint', 'translate': 'translation', 'grammar': 'grammar'}[action]
    return result[key]


def begin_vocabulary(engine):
    updated = record_help(engine, 'vocabulary')
    if updated['simulation']['return_point']:
        return updated
    updated['simulation']['return_point'] = {key: deepcopy(updated.get(key)) for key in RETURN_FIELDS}
    updated['simulation']['return_point']['content'] = deepcopy(updated['simulation']['last_content'])
    question = updated['last_question']
    situation = speaking.current_situation(updated)
    vocabulary = situation['vocabulary']
    step = situation['sequence'][updated['step_index']]
    context = ' '.join([question, step['goal'], *step['possible_responses']])
    fallback = next((i for i, item in enumerate(vocabulary) if item['expression'] not in updated['practiced_vocabulary']), 0)
    index = next((i for i, item in enumerate(vocabulary) if speaking.contains_expression(context, item['expression'])), fallback)
    updated = speaking_preparation.start(updated)
    updated['preparation']['item_index'] = index
    speaking_preparation.set_question(updated)
    return updated


def resume(engine):
    updated = ensure(engine)
    point = updated['simulation']['return_point']
    if point:
        for key in RETURN_FIELDS:
            if point[key] is None:
                updated.pop(key, None)
            else:
                updated[key] = deepcopy(point[key])
        updated['simulation']['last_content'] = deepcopy(point['content'])
        updated['simulation']['return_point'] = None
    return updated


def new_challenge(engine, situation, level):
    plan = deepcopy(engine['plan'])
    previous = ensure(engine)['simulation']
    known = plan['situations'] + [item['situation'] for item in previous['challenge_history'] if item.get('situation')]
    if any(s['context'].casefold() == situation['context'].casefold() for s in known):
        raise ValueError('O novo desafio precisa apresentar outra situação concreta.')
    if any(s['id'] == situation['id'] for s in known):
        raise ValueError('Use um identificador novo para o desafio.')
    # Keep the original ScenarioPlan size contract; archived situations retain their full context.
    plan['situations'] = plan['situations'][-2:] + [situation]
    plan = speaking.validate_plan(plan, level, '')
    updated = speaking.start_session(plan, situation['id'])
    for key in ['help_used', 'practiced_vocabulary', 'difficulties', 'taught_expressions', 'turn_count']:
        updated[key] = deepcopy(engine[key])
    updated = ensure(updated)
    updated['simulation']['challenge_history'] = (previous['challenge_history'] + [{
        'situation_id': engine['situation_id'], 'step_index': engine['step_index'],
        'situation': deepcopy(speaking.current_situation(engine)),
        'completed_step_ids': deepcopy(engine['completed_step_ids']),
        'last_content': deepcopy(previous['last_content']), 'exchanges': deepcopy(previous['exchanges']),
    }])[-10:]
    return speaking_preparation.start(updated)
