"""Speaking pedagogy and AI contracts, independent of Django and the AI provider."""

from copy import deepcopy
import re
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

Phase = Literal['LEARN', 'PRACTICE', 'SIMULATE', 'FEEDBACK']
Observation = Literal['ready', 'adequate', 'mastered', 'struggling', 'off_topic', 'help', 'not_evaluated']

LEVEL_POLICIES = {
    'A1': dict(instructions='Português brasileiro', vocabulary='palavras básicas e concretas',
               grammar='presente simples, uma ideia por frase', max_words=45, phrase_words=8,
               translations=True, support='tradução e início de resposta sempre disponíveis', practice_successes=2,
               simulation='uma pergunta curta por vez, sem pressupor conhecimento'),
    'A2': dict(instructions='Predominantemente português, com inglês simples', vocabulary='expressões frequentes do cotidiano',
               grammar='estruturas simples no presente, passado e futuro', max_words=65, phrase_words=12,
               translations=True, support='tradução e modelos curtos', practice_successes=2,
               simulation='trocas curtas com escolhas familiares'),
    'B1': dict(instructions='Principalmente inglês, português quando necessário', vocabulary='vocabulário cotidiano e contextual',
               grammar='tempos comuns e conexões com because, but e so', max_words=90, phrase_words=22,
               translations=False, support='explicação em português quando houver dificuldade', practice_successes=1,
               simulation='situações concretas com pequenos imprevistos'),
    'B2': dict(instructions='Predominantemente inglês', vocabulary='vocabulário variado e específico do contexto',
               grammar='orações complexas e justificativas', max_words=110, phrase_words=32,
               translations=False, support='pistas pontuais, reduzidas conforme o domínio', practice_successes=1,
               simulation='negociação, problemas e explicações detalhadas'),
    'C1': dict(instructions='Inglês natural', vocabulary='expressões idiomáticas e nuances de registro',
               grammar='estruturas avançadas com precisão e flexibilidade', max_words=140, phrase_words=45,
               translations=False, support='reformulações sutis quando necessário', practice_successes=1,
               simulation='interações realistas, ambíguas e desafiadoras'),
    'C2': dict(instructions='Inglês natural e espontâneo', vocabulary='expressões idiomáticas, sutilezas e linguagem especializada',
               grammar='controle sofisticado de estruturas e registro', max_words=160, phrase_words=55,
               translations=False, support='ajuda sob demanda com nuances pragmáticas', practice_successes=1,
               simulation='improvisação, implicações culturais e objetivos conflitantes'),
}


def level_policy(level):
    return deepcopy(LEVEL_POLICIES[level])


def contains_expression(text, expression):
    return bool(re.search(r'(?<!\w)' + re.escape(expression) + r'(?!\w)', text, re.IGNORECASE))


class Contract(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True, str_strip_whitespace=True)


class VocabularyItem(Contract):
    expression: str = Field(min_length=1)
    translation: str = Field(min_length=1)
    example: str = Field(min_length=1)
    example_translation: str = Field(min_length=1)


class Branch(Contract):
    learner_intent: str = Field(min_length=1)
    next_step_id: str = Field(min_length=1)


class ScenarioStep(Contract):
    id: str = Field(min_length=1)
    label: str = Field(min_length=1)
    goal: str = Field(min_length=1)
    possible_responses: list[str] = Field(min_length=2, max_length=3)
    branches: list[Branch] = Field(min_length=1, max_length=3)


class Situation(Contract):
    id: str = Field(min_length=1)
    label: str = Field(min_length=1)
    context: str = Field(min_length=40, max_length=600)
    ai_role: str = Field(min_length=1)
    student_role: str = Field(min_length=1)
    objective: str = Field(min_length=1)
    sequence: list[ScenarioStep] = Field(min_length=3, max_length=6)
    vocabulary: list[VocabularyItem] = Field(min_length=2, max_length=5)


class ScenarioPlan(Contract):
    situations: list[Situation] = Field(min_length=2, max_length=3)


class TurnContent(Contract):
    feedback: str
    instruction: str
    demonstration: str
    demonstration_translation: str
    question: str
    question_translation: str
    response_starter: str
    response_starter_translation: str


class TutorTurn(Contract):
    observation: Observation
    evidence: str
    difficulty: str
    next_phase: Phase
    next_step_id: str
    content: TurnContent


def response_schema(name, model):
    return {'name': name, 'strict': True, 'schema': model.model_json_schema()}


def _concrete(text, title=''):
    normalized = ' '.join(text.casefold().split()).rstrip('.')
    if normalized == title.casefold() or len(normalized.split()) < 7:
        raise ValueError('O contexto precisa descrever uma situação concreta.')
    if re.match(r'^(imagine|imagine uma situação|imagine a situation)\b', normalized):
        raise ValueError('Não peça ao aluno para inventar o contexto.')


def validate_plan(payload, level, scenario_label):
    plan = ScenarioPlan.model_validate(payload).model_dump()
    policy = level_policy(level)
    ids = [s['id'] for s in plan['situations']]
    if len(set(ids)) != len(ids):
        raise ValueError('As situações precisam de identificadores únicos.')
    for situation in plan['situations']:
        _concrete(situation['context'], scenario_label)
        steps = situation['sequence']
        positions = {step['id']: index for index, step in enumerate(steps)}
        if len(positions) != len(steps):
            raise ValueError('As etapas precisam de identificadores únicos.')
        for index, step in enumerate(steps):
            for branch in step['branches']:
                target = branch['next_step_id']
                if target != 'END' and (target not in positions or positions[target] <= index):
                    raise ValueError('Ramificações devem apontar para etapas futuras ou END.')
            for phrase in step['possible_responses']:
                if not phrase.strip() or len(phrase.split()) > policy['phrase_words']:
                    raise ValueError('A resposta sugerida excede a complexidade do nível.')
        for item in situation['vocabulary']:
            if len(item['example'].split()) > policy['phrase_words']:
                raise ValueError('O exemplo excede a extensão adequada ao nível.')
        if len(opening(start_session(plan, situation['id']), level).split()) > policy['max_words'] * 2:
            raise ValueError('A apresentação inicial precisa ser mais curta para este nível.')
    return plan


def start_session(plan, situation_id=None):
    situation = next((s for s in plan['situations'] if s['id'] == situation_id), None)
    if situation_id and situation is None:
        raise ValueError('Situação inválida.')
    situation = situation or plan['situations'][0]
    return {
        'version': 1, 'phase': 'LEARN', 'plan': deepcopy(plan), 'situation_id': situation['id'],
        'step_index': 0, 'completed_step_ids': [], 'completed_phases': [],
        'turn_count': 0, 'phase_turns': 0, 'successful_turns': 0, 'consecutive_difficulties': 0,
        'transition_reason': 'preparation_required', 'last_question': '',
        'taught_expressions': [situation['vocabulary'][0]['example']],
        'practiced_vocabulary': [], 'difficulties': [], 'help_used': [],
    }


def current_situation(state):
    return next(s for s in state['plan']['situations'] if s['id'] == state['situation_id'])


HELP_ACTIONS = {'vocabulary', 'grammar', 'pronunciation'}


def advance(state, level, observation, evidence, learner_input, action_value='', next_step_id=''):
    """The server owns progression; buttons and help never count as mastery."""
    updated = deepcopy(state)
    phase = state['phase']
    evaluated = not action_value and observation in {'adequate', 'mastered', 'struggling', 'off_topic'}
    if evaluated and (not evidence or evidence.casefold() not in learner_input.casefold()):
        raise ValueError('A observação precisa citar a resposta real do aluno.')
    updated['turn_count'] += 1
    updated['transition_reason'] = 'continue_current_phase'
    if action_value in HELP_ACTIONS or (not action_value and observation == 'help'):
        updated['help_used'] = (updated['help_used'] + [{
            'action': action_value or 'request', 'phase': phase,
            'question': state['last_question'], 'turn': updated['turn_count'],
        }])[-60:]
        updated['transition_reason'] = 'contextual_support'
        return updated
    if phase == 'FEEDBACK':
        return updated
    if phase == 'LEARN':
        if action_value == 'continue' or (not action_value and observation in {'ready', 'adequate', 'mastered'}):
            updated['phase'] = 'PRACTICE'
            updated['transition_reason'] = 'demonstration_delivered'
    elif evaluated:
        updated['phase_turns'] += 1
        if observation in {'adequate', 'mastered'}:
            updated['successful_turns'] += 1
            updated['consecutive_difficulties'] = 0
            if phase == 'PRACTICE' and (
                observation == 'mastered' or updated['successful_turns'] >= level_policy(level)['practice_successes']
            ):
                updated['phase'] = 'SIMULATE'
                updated['transition_reason'] = 'demonstrated_mastery' if observation == 'mastered' else 'guided_practice_completed'
            elif phase == 'SIMULATE':
                situation = current_situation(state)
                steps = situation['sequence']
                step = steps[state['step_index']]
                allowed = {b['next_step_id'] for b in step['branches']}
                target = next_step_id or step['branches'][0]['next_step_id']
                if target not in allowed:
                    raise ValueError('A ramificação não pertence à etapa atual.')
                updated['completed_step_ids'] = list(dict.fromkeys(updated['completed_step_ids'] + [step['id']]))
                if target == 'END':
                    updated['phase'] = 'FEEDBACK'
                    updated['transition_reason'] = 'communicative_objective_completed'
                else:
                    updated['step_index'] = next(i for i, s in enumerate(steps) if s['id'] == target)
                    updated['transition_reason'] = 'situation_progress'
        else:
            updated['consecutive_difficulties'] += 1
            updated['successful_turns'] = 0
            if updated['consecutive_difficulties'] >= 2:
                updated['phase'] = 'LEARN' if phase == 'PRACTICE' else 'PRACTICE'
                updated['transition_reason'] = 'reinforce_with_simpler_example'
    if evaluated:
        if observation in {'struggling', 'off_topic'}:
            updated['difficulties'] = (updated['difficulties'] + [{
                'phase': phase, 'evidence': evidence, 'kind': observation,
            }])[-60:]
        if observation in {'adequate', 'mastered'}:
            for item in current_situation(state)['vocabulary']:
                if contains_expression(learner_input, item['expression']):
                    if item['expression'] not in updated['practiced_vocabulary']:
                        updated['practiced_vocabulary'].append(item['expression'])
    if updated['phase'] != phase:
        if updated['phase'] == 'SIMULATE' and (state.get('preparation') or {}).get('step', 'COMPLETE') != 'COMPLETE':
            raise ValueError('Conclua a preparação de vocabulário e a prática guiada antes da simulação.')
        if updated['phase'] in {'SIMULATE', 'FEEDBACK'} or phase == 'LEARN':
            updated['completed_phases'] = list(dict.fromkeys(updated['completed_phases'] + [phase]))
        updated['phase_turns'] = 0
        updated['successful_turns'] = 0
        updated['consecutive_difficulties'] = 0
    return updated


def apply_turn(state, level, payload, learner_input, action_value=''):
    turn = TutorTurn.model_validate(payload).model_dump()
    updated = advance(state, level, turn['observation'], turn['evidence'], learner_input, action_value, turn['next_step_id'])
    if turn['next_phase'] != updated['phase']:
        raise ValueError(f"A resposta deve pertencer à etapa {updated['phase']}.")
    content = turn['content']
    policy = level_policy(level)
    if sum(len(text.split()) for text in content.values()) > policy['max_words'] * 2:
        raise ValueError('A mensagem excede o limite do nível, incluindo traduções.')
    if updated['phase'] != 'FEEDBACK':
        if not content['question']:
            raise ValueError('A próxima pergunta precisa estar explícita.')
        if len(content['question'].split()) > policy['phrase_words']:
            raise ValueError('A pergunta excede a extensão do nível.')
        if len(content['demonstration'].split()) > policy['phrase_words']:
            raise ValueError('A demonstração excede a extensão do nível.')
        if policy['translations'] and not content['question_translation']:
            raise ValueError('Iniciantes precisam da tradução da pergunta.')
        if updated['phase'] in {'LEARN', 'PRACTICE'} and not content['demonstration']:
            raise ValueError('É preciso demonstrar antes de pedir uma resposta.')
        if policy['translations']:
            for field in ['demonstration', 'response_starter']:
                if content[field] and not content[f'{field}_translation']:
                    raise ValueError('Exemplos e apoios precisam de tradução para iniciantes.')
        if updated['transition_reason'] == 'contextual_support' and content['question'] != state['last_question']:
            raise ValueError('A ajuda precisa preservar a pergunta aguardando resposta.')
    updated['last_question'] = content['question'] if updated['phase'] != 'FEEDBACK' else ''
    if content['demonstration'] and content['demonstration'] not in updated['taught_expressions']:
        updated['taught_expressions'] = (updated['taught_expressions'] + [content['demonstration']])[-30:]
    if turn['difficulty'] and turn['observation'] in {'struggling', 'off_topic'} and not action_value:
        if updated['difficulties']:
            updated['difficulties'][-1]['detail'] = turn['difficulty']
    if not render_turn(content, level):
        raise ValueError('A resposta do professor não pode ficar vazia.')
    return updated, content


def opening(state, level):
    situation = current_situation(state)
    item = situation['vocabulary'][0]
    beginner = level in {'A1', 'A2'}
    question = 'Vamos tentar juntos?' if beginner else 'Ready to try it together?'
    state['last_question'] = question
    if beginner:
        text = (
            f"Boa! {situation['context']}\n\n"
            f"Eu sou {situation['ai_role']} e você é {situation['student_role']}. "
            f"Vamos {situation['objective']}\n\n"
            f"Primeiro, uma frase para te ajudar: {item['expression']} — {item['translation']}.\n"
            f"Por exemplo: {item['example']} — {item['example_translation']}\n\n{question}"
        )
    else:
        text = (
            f"Great! {situation['context']}\n\n"
            f"I'll be {situation['ai_role']}; you'll be {situation['student_role']}. "
            f"Let's {situation['objective']}\n\n"
            f"Here's a useful expression: {item['expression']}.\nFor example: {item['example']}\n\n{question}"
        )
    return text


def render_turn(content, level):
    parts = [content['feedback'], content['instruction']]
    for field in ['demonstration', 'question', 'response_starter']:
        if content[field]:
            text = content[field]
            if level_policy(level)['translations'] and content[f'{field}_translation']:
                text += f" — {content[f'{field}_translation']}"
            parts.append(text)
    return '\n\n'.join(part for part in parts if part)
