"""Phase 2 vocabulary microsteps. Existing plan and tutor contracts stay unchanged."""

from copy import deepcopy
from typing import Literal

from pydantic import Field

from . import speaking

MAX_ATTEMPTS = 3


class GuidedTask(speaking.Contract):
    instruction: str = Field(min_length=1)
    question: str = Field(min_length=1)
    question_translation: str = Field(min_length=1)
    model_answer: str = Field(min_length=1)
    model_answer_translation: str = Field(min_length=1)
    hint: str = Field(min_length=1)


class PracticeAssessment(speaking.Contract):
    observation: Literal['adequate', 'mastered', 'struggling', 'off_topic', 'help']
    evidence: str
    feedback: str = Field(min_length=1)
    hint: str
    alternate_example: str
    alternate_example_translation: str


def start(engine):
    updated = deepcopy(engine)
    updated['preparation'] = {
        'version': 1, 'step': 'WORD', 'item_index': 0, 'attempts': {},
        'completed_indices': [], 'review_indices': [], 'feedback': '', 'hint': '',
        'alternate_example': '', 'alternate_example_translation': '', 'task': None,
        'guided_attempts': 0, 'guided_successes': 0, 'guided_history': [],
        'next': '', 'assessment_source': None,
    }
    updated['phase'] = 'LEARN'
    updated['phase_turns'] = updated['successful_turns'] = updated['consecutive_difficulties'] = 0
    set_question(updated)
    return updated


def pending(engine):
    return bool(engine.get('preparation') and engine['preparation']['step'] != 'COMPLETE')


def item(engine):
    prep = engine['preparation']
    result = deepcopy(speaking.current_situation(engine)['vocabulary'][prep['item_index']])
    if prep['alternate_example']:
        result['example'] = prep['alternate_example']
        result['example_translation'] = prep['alternate_example_translation']
    return result


def set_question(engine):
    prep = engine['preparation']
    engine['last_question'] = (
        prep['task']['question'] if prep['step'] == 'GUIDED' and prep['task']
        else item(engine)['example'] if prep['step'] == 'REPEAT' else ''
    )


def validate_task(payload, engine, level):
    task = GuidedTask.model_validate(payload).model_dump()
    policy = speaking.level_policy(level)
    for key in ['question', 'model_answer']:
        if len(task[key].split()) > policy['phrase_words']:
            raise ValueError('A atividade precisa usar frases curtas adequadas ao nível.')
    taught = engine['preparation']['completed_indices'] + engine['preparation']['review_indices']
    vocabulary = speaking.current_situation(engine)['vocabulary']
    if not any(vocabulary[i]['expression'].casefold() in task['model_answer'].casefold() for i in taught):
        raise ValueError('O modelo de resposta precisa usar o vocabulário já apresentado.')
    if task['question'] in engine['preparation']['guided_history']:
        raise ValueError('Ofereça outra pergunta contextualizada em vez de repetir o exercício.')
    if sum(len(v.split()) for v in task.values()) > policy['max_words'] * 2:
        raise ValueError('A atividade guiada está longa demais.')
    return task


def validate_assessment(payload, learner_input, level, engine=None):
    result = PracticeAssessment.model_validate(payload).model_dump()
    if result['observation'] != 'help' and (
        not result['evidence'] or result['evidence'].casefold() not in learner_input.casefold()
    ):
        raise ValueError('O feedback precisa citar a resposta real do aluno.')
    if result['alternate_example'] and not result['alternate_example_translation']:
        raise ValueError('O novo exemplo precisa de tradução.')
    if engine and engine['preparation']['step'] == 'REPEAT' and result['observation'] in {'struggling', 'off_topic'}:
        attempts = engine['preparation']['attempts'].get(str(engine['preparation']['item_index']), 0)
        if attempts >= 1 and (not result['alternate_example'] or result['alternate_example'] == item(engine)['example']):
            raise ValueError('Após dificuldade repetida, demonstre outro exemplo contextualizado e traduzido.')
    if len(result['alternate_example'].split()) > speaking.level_policy(level)['phrase_words']:
        raise ValueError('Use um exemplo mais simples para esse nível.')
    if sum(len(v.split()) for v in result.values()) > speaking.level_policy(level)['max_words'] * 2:
        raise ValueError('O feedback precisa ser curto.')
    return result


def transition(engine, level, action='', assessment=None, learner_input='', source='text'):
    updated = deepcopy(engine)
    prep = updated['preparation']
    step = prep['step']
    updated['turn_count'] += 1
    updated['transition_reason'] = 'vocabulary_preparation'
    if action == 'hint':
        prep['hint'] = prep['hint'] or (prep['task']['hint'] if prep['task'] else
                                       f"{item(updated)['expression']} — {item(updated)['translation']}")
        updated['help_used'] = (updated['help_used'] + [{
            'action': 'preparation_hint', 'phase': updated['phase'],
            'question': updated['last_question'], 'turn': updated['turn_count'],
        }])[-60:]
    elif action in {'next', 'continue', 'retry'}:
        if step == 'WORD':
            prep['step'] = 'EXAMPLE'
            example = item(updated)['example']
            if example not in updated['taught_expressions']:
                updated['taught_expressions'] = (updated['taught_expressions'] + [example])[-30:]
        elif step == 'EXAMPLE':
            prep['step'] = 'REPEAT'
        elif step == 'FEEDBACK':
            route = prep['next']
            if route == 'retry':
                prep['step'] = 'GUIDED' if prep['task'] else 'REPEAT'
            elif action == 'retry':
                raise ValueError('As tentativas deste exercício terminaram. Siga para a próxima atividade.')
            elif route == 'finish':
                prep['step'] = 'COMPLETE'
                updated['phase'] = 'SIMULATE'
                updated['completed_phases'] = list(dict.fromkeys(updated['completed_phases'] + ['LEARN', 'PRACTICE']))
                updated['transition_reason'] = 'guided_vocabulary_mastery'
                updated['phase_turns'] = updated['successful_turns'] = updated['consecutive_difficulties'] = 0
                # The existing tutor handles this same continue event on handoff.
                updated['turn_count'] -= 1
            elif route == 'guided':
                prep['step'] = 'GUIDED'
                prep['task'] = None
                updated['phase'] = 'PRACTICE'
            else:
                vocabulary = speaking.current_situation(updated)['vocabulary']
                prep['item_index'] = (prep['item_index'] + 1) % len(vocabulary)
                prep['step'] = 'WORD'
                prep['task'] = None
                prep['alternate_example'] = prep['alternate_example_translation'] = ''
                prep['attempts'][str(prep['item_index'])] = 0
                prep['guided_attempts'] = prep['guided_successes'] = 0
                updated['phase'] = 'LEARN'
            prep['feedback'] = prep['hint'] = ''
        # Clicking continue during a response task repeats its instructions, without credit.
    elif assessment is not None and step in {'REPEAT', 'GUIDED'}:
        result = validate_assessment(assessment, learner_input, level, engine)
        prep['feedback'], prep['hint'] = result['feedback'], result['hint']
        if result['observation'] == 'help':
            updated['help_used'] = (updated['help_used'] + [{
                'action': 'request', 'phase': updated['phase'], 'question': updated['last_question'],
                'turn': updated['turn_count'],
            }])[-60:]
            return updated
        prep['assessment_source'] = source
        success = result['observation'] in {'adequate', 'mastered'}
        if not success:
            updated['difficulties'] = (updated['difficulties'] + [{
                'phase': updated['phase'], 'evidence': result['evidence'], 'kind': result['observation'],
                'detail': result['feedback'],
            }])[-60:]
        if step == 'REPEAT':
            index = prep['item_index']
            attempts = prep['attempts'].get(str(index), 0) + 1
            prep['attempts'][str(index)] = attempts
            if success and index not in prep['completed_indices']:
                prep['completed_indices'].append(index)
            if success:
                prep['review_indices'] = [i for i in prep['review_indices'] if i != index]
                _record_vocabulary(updated, learner_input)
            elif attempts >= MAX_ATTEMPTS and index not in prep['review_indices']:
                prep['review_indices'].append(index)
            if not success and attempts < MAX_ATTEMPTS:
                prep['next'] = 'retry'
                if attempts >= 2 and result['alternate_example']:
                    prep['alternate_example'] = result['alternate_example']
                    prep['alternate_example_translation'] = result['alternate_example_translation']
                    updated['taught_expressions'] = list(dict.fromkeys(
                        updated['taught_expressions'] + [result['alternate_example']]))[-30:]
            else:
                taught_count = len(set(prep['completed_indices'] + prep['review_indices']))
                batch_size = min(2 if level in {'A1', 'A2'} else 1, len(speaking.current_situation(updated)['vocabulary']))
                prep['next'] = 'guided' if taught_count >= batch_size else 'item'
        else:
            prep['guided_attempts'] += 1
            prep['guided_successes'] = prep['guided_successes'] + 1 if success else 0
            if success:
                _record_vocabulary(updated, learner_input)
            if success and (result['observation'] == 'mastered' or prep['guided_successes'] >= speaking.level_policy(level)['practice_successes']):
                prep['next'] = 'finish'
            elif prep['guided_attempts'] >= MAX_ATTEMPTS:
                prep['next'] = 'review'
            else:
                prep['next'] = 'guided' if success else 'retry'
        prep['step'] = 'FEEDBACK'
    set_question(updated)
    return updated


def _record_vocabulary(engine, learner_input):
    for vocabulary_item in speaking.current_situation(engine)['vocabulary']:
        if speaking.contains_expression(learner_input, vocabulary_item['expression']):
            engine['practiced_vocabulary'] = list(dict.fromkeys(
                engine['practiced_vocabulary'] + [vocabulary_item['expression']]))


def snapshot(engine, level='A1'):
    prep = engine['preparation']
    return {
        'step': prep['step'], 'item_index': prep['item_index'], 'item': item(engine),
        'total_items': len(speaking.current_situation(engine)['vocabulary']),
        'completed_count': len(prep['completed_indices']), 'review_count': len(prep['review_indices']),
        'feedback': prep['feedback'], 'hint': prep['hint'], 'task': prep['task'],
        'next': prep['next'], 'assessment_source': prep['assessment_source'],
        'attempts': prep['guided_attempts'] if prep['task'] else prep['attempts'].get(str(prep['item_index']), 0),
        'max_attempts': MAX_ATTEMPTS,
        'show_translations': speaking.level_policy(level)['translations'],
    }


def message_text(engine, level):
    prep = engine['preparation']
    current = item(engine)
    beginner = level in {'A1', 'A2'}
    if prep['step'] == 'WORD':
        return f"{current['expression']} — {current['translation']}"
    if prep['step'] == 'EXAMPLE':
        return f"{current['example']} — {current['example_translation']}"
    if prep['step'] == 'REPEAT':
        return (f"Agora tente falar: {current['example']}" if beginner else f"Try saying: {current['example']}")
    if prep['step'] == 'GUIDED' and prep['task']:
        task = prep['task']
        return '\n\n'.join([task['instruction'], task['question'], task['question_translation']] if beginner else [task['instruction'], task['question']])
    if prep['step'] == 'FEEDBACK':
        return prep['feedback']
    return 'Vamos praticar juntos.' if beginner else "Let's practise together."
