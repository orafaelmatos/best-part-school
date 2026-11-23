"""Deterministic reports from validated observations. No provider or acoustic scoring."""
from collections import OrderedDict
from copy import deepcopy

from . import speaking


EVALUATED = {'adequate', 'mastered', 'struggling', 'off_topic'}
SUCCESS = {'adequate', 'mastered'}


def observation(before, after, answer, result, source, message_id):
    if result['observation'] not in EVALUATED:
        return None
    if not result.get('evidence') or result['evidence'].casefold() not in answer.casefold():
        raise ValueError('O relatório exige uma evidência da resposta real.')
    situation = speaking.current_situation(before)
    prep = before.get('preparation') or {}
    activity = prep.get('step') if prep.get('step') in {'REPEAT', 'GUIDED'} else before['phase']
    completed = (activity == 'REPEAT' and result['observation'] in SUCCESS) or (
        activity == 'GUIDED' and (after.get('preparation') or {}).get('next') == 'finish'
    ) or (before['phase'] == 'PRACTICE' and after['phase'] == 'SIMULATE')
    return {
        'answer': answer, 'evidence': result['evidence'], 'source': source, 'message_id': str(message_id),
        'observation': result['observation'], 'feedback': result.get('feedback') or result.get('content', {}).get('feedback', ''),
        'difficulty': result.get('difficulty') or (result.get('feedback', '') if result['observation'] not in SUCCESS else ''),
        'phase': before['phase'], 'activity': activity, 'question': before['last_question'],
        'activity_completed': completed, 'situation': deepcopy(situation),
        'completed_step_ids': deepcopy(after['completed_step_ids']),
        'objective_completed': before['phase'] == 'SIMULATE' and after['phase'] == 'FEEDBACK',
    }


def build(state, events, *, status, generated_at):
    engine = state['speaking']
    # Only validated learner observations enter metrics, never buttons, help or tutor examples.
    events = [e for e in events if e and e.get('observation') in EVALUATED
              and e.get('evidence') and e['evidence'].casefold() in e.get('answer', '').casefold()]
    phrases, vocabulary, difficulties, situations, activities = [], OrderedDict(), OrderedDict(), OrderedDict(), set()
    positive = []
    for event in events:
        phrases.append({key: event.get(key, '') for key in ['answer', 'evidence', 'source', 'message_id', 'phase', 'question', 'observation']})
        situation = event['situation']
        record = situations.setdefault(situation['id'], {
            'id': situation['id'], 'label': situation['label'], 'objective': situation['objective'],
            'total_steps': len(situation['sequence']), 'completed_step_ids': [], 'completed': False,
        })
        record['completed_step_ids'] = list(dict.fromkeys(record['completed_step_ids'] + event['completed_step_ids']))
        record['completed'] |= event['objective_completed']
        if event['activity_completed']:
            activities.add((situation['id'], event['activity'], event['question']))
        for word in situation['vocabulary']:
            if speaking.contains_expression(event['answer'], word['expression']):
                item = vocabulary.setdefault(word['expression'].casefold(), {
                    **word, 'attempts': 0, 'successful_uses': 0, 'evidence': [],
                })
                item['attempts'] += 1
                item['successful_uses'] += event['observation'] in SUCCESS
                item['evidence'].append(event['evidence'])
        if event['observation'] in SUCCESS:
            positive.append({'text': 'Resposta adequada ao contexto.' if event['observation'] == 'adequate' else 'Domínio demonstrado nesta resposta.',
                             'evidence': event['evidence'], 'source': event['source']})
        else:
            detail = event['difficulty'] or 'Resposta que precisa de apoio no contexto.'
            key = (event['observation'], ' '.join(detail.casefold().split()))
            issue = difficulties.setdefault(key, {'detail': detail, 'kind': event['observation'], 'occurrences': 0, 'evidence': []})
            issue['occurrences'] += 1
            issue['evidence'].append(event['evidence'])
    # Older sessions may have a saved trajectory but lack the new observation metadata.
    archived = (engine.get('simulation') or {}).get('challenge_history', [])
    snapshots = archived + [{'situation': speaking.current_situation(engine),
                             'completed_step_ids': engine['completed_step_ids'],
                             'exchanges': (engine.get('simulation') or {}).get('exchanges', [])}]
    legacy_records = False
    for snapshot in snapshots:
        situation = snapshot['situation']
        record = situations.setdefault(situation['id'], {
            'id': situation['id'], 'label': situation['label'], 'objective': situation['objective'],
            'total_steps': len(situation['sequence']), 'completed_step_ids': [], 'completed': False,
        })
        record['completed_step_ids'] = list(dict.fromkeys(record['completed_step_ids'] + snapshot['completed_step_ids']))
        if situation['id'] == engine['situation_id']:
            record['completed'] |= bool(engine.get('objective_completed')) or any(
                branch['to_step_id'] == 'END' for branch in (engine.get('simulation') or {}).get('branch_history', []))
        for exchange in snapshot.get('exchanges', []):
            if any(p['answer'] == exchange['answer'] and p['question'] == exchange['question'] for p in phrases):
                continue
            legacy_records = True
            phrases.append({'answer': exchange['answer'], 'evidence': exchange['evidence'], 'question': exchange['question'],
                            'source': 'history', 'message_id': '', 'phase': 'SIMULATE', 'observation': 'unclassified'})
            for word in situation['vocabulary']:
                if speaking.contains_expression(exchange['answer'], word['expression']):
                    item = vocabulary.setdefault(word['expression'].casefold(), {**word, 'attempts': 0, 'successful_uses': 0, 'evidence': []})
                    item['attempts'] += 1
                    item['evidence'].append(exchange['evidence'])
    observed_evidence = {event['evidence'] for event in events}
    for issue in engine['difficulties']:
        if not issue.get('evidence') or issue['evidence'] in observed_evidence:
            continue
        legacy_records = True
        detail = issue.get('detail') or 'Resposta que precisou de apoio no contexto.'
        key = (issue['kind'], ' '.join(detail.casefold().split()))
        record = difficulties.setdefault(key, {'detail': detail, 'kind': issue['kind'], 'occurrences': 0, 'evidence': []})
        record['occurrences'] += 1
        record['evidence'].append(issue['evidence'])
    issues = list(difficulties.values())
    recommendations = [{'text': f"Retome este ponto com seu professor: {issue['detail']}", 'evidence': issue['evidence'][0]} for issue in issues]
    if not recommendations and positive:
        recommendations.append({'text': 'Pratique novamente as frases usadas em outra situação do mesmo cenário.', 'evidence': positive[-1]['evidence']})
    if not events:
        recommendations.append({'text': 'Responda a uma atividade para registrar evidências e orientar sua revisão.', 'evidence': ''})
    return {
        'version': 1, 'run_id': engine['run_id'], 'scenario': state.get('scenario_label', ''),
        'level': state.get('level', ''), 'status': status, 'generated_at': generated_at,
        'assessment_basis': 'text_and_transcripts', 'pronunciation_assessed': False,
        'phrases_used': phrases, 'vocabulary': list(vocabulary.values()),
        'difficulties': issues, 'recurring_errors': [issue for issue in issues if issue['occurrences'] >= 2],
        'strengths': positive, 'recommendations': recommendations,
        'progress': {
            'evaluated_responses': len(events), 'successful_responses': len(positive),
            'activities_completed': len(activities), 'situations_completed': sum(s['completed'] for s in situations.values()),
            'situations': list(situations.values()),
            'completed_phases': deepcopy(engine['completed_phases']),
        },
        'help_used': deepcopy(engine['help_used']),
        'limitations': ['Feedback sobre conteúdo escrito ou transcrito. Pronúncia não avaliada.',
                        'Vocabulário praticado nesta sessão; não indica conhecimento novo fora dela.'] + (
            ['Registros anteriores à avaliação estruturada não entram nas contagens de respostas.'] if legacy_records or not events else []),
    }
