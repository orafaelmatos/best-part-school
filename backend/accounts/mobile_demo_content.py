"""Offline, level-specific classroom content for the opt-in mobile demo seed.

Only demo objects with deterministic IDs are created. Existing content is never
updated, so rerunning this helper preserves a teacher's or student's edits.
"""
from datetime import datetime, time, timedelta
from html import escape
from uuid import NAMESPACE_URL, uuid5

from django.db import transaction
from django.utils import timezone

from lessons.homework_auto import HomeworkAutoCorrectionService
from lessons.models import (
    Homework, HomeworkAnswer, HomeworkQuestion, LessonSummary,
    LessonSummaryMistake, LessonSummaryNextTopic, LessonSummaryWord, NewWord,
    VocabularyCard, VocabularyCategory, VocabularyReviewLog,
)


LEVEL_CONTENT = {
    'A1/A2': {
        'focus': 'Apresentações, rotina e lugares da cidade',
        'paragraphs': [
            'My name is Ana. I live in São Paulo and I study English twice a week. My favourite day is Saturday.',
            'I usually wake up at seven. I have breakfast at home and take the bus to work. In the evening, I read a book.',
            'There is a small bakery next to my house. The library is opposite the park. I can walk there in ten minutes.',
        ],
        'prompts': ['Introduce yourself and say where you live.', 'Describe your morning routine in three sentences.', 'Describe two places near your home.'],
        'mistakes': [('I have 25 years.', 'I am 25 years old.'), ('She work every day.', 'She works every day.'), ('There have a park.', 'There is a park.')],
        'choices': [
            ('Choose the correct introduction.', ['I am a student.', 'I is a student.', 'I are a student.']),
            ('Complete: She ___ breakfast at seven.', ['has', 'have', 'having']),
            ('Complete: There ___ two parks near my house.', ['are', 'is', 'am']),
        ],
        'words': [
            ('neighbourhood', 'bairro', 'My neighbourhood is quiet.'),
            ('usually', 'geralmente', 'I usually study after dinner.'),
            ('twice a week', 'duas vezes por semana', 'I have English classes twice a week.'),
            ('wake up', 'acordar', 'I wake up at seven.'),
            ('breakfast', 'café da manhã', 'We have breakfast together.'),
            ('take the bus', 'pegar o ônibus', 'I take the bus to work.'),
            ('bakery', 'padaria', 'The bakery opens early.'),
            ('opposite', 'em frente a / do outro lado', 'The library is opposite the park.'),
            ('next to', 'ao lado de', 'The café is next to my house.'),
        ],
    },
    'B1': {
        'focus': 'Experiências, viagens e planos pessoais',
        'paragraphs': [
            'Last year I travelled alone for the first time. Although I was nervous, I asked local people for advice and discovered a wonderful market.',
            'I have worked on this project since March. I have already finished the research, but I have not presented the results yet.',
            'If I save enough money this year, I will take a short course abroad. I am going to practise speaking every day to prepare.',
        ],
        'prompts': ['Describe a memorable trip and explain what you learned.', 'Explain what you have already done on a recent project.', 'Describe a realistic plan and one condition for achieving it.'],
        'mistakes': [('I have visited London last year.', 'I visited London last year.'), ('I work here since March.', 'I have worked here since March.'), ('If I will save money, I will travel.', 'If I save money, I will travel.')],
        'choices': [
            ('Choose the sentence about a finished past event.', ['I visited Recife last July.', 'I have visited Recife last July.', 'I visit Recife last July.']),
            ('Complete: I have worked here ___ 2022.', ['since', 'for', 'during']),
            ('Complete: If it rains, we ___ indoors.', ['will stay', 'would stayed', 'will staying']),
        ],
        'words': [
            ('memorable', 'marcante / memorável', 'It was a memorable journey.'),
            ('although', 'embora', 'Although it rained, we enjoyed the trip.'),
            ('find out', 'descobrir / obter informação', 'I want to find out more about the course.'),
            ('already', 'já', 'I have already sent the report.'),
            ('yet', 'ainda / já, em perguntas e negativas', 'We have not finished yet.'),
            ('achievement', 'conquista', 'Finishing the project was an important achievement.'),
            ('save up', 'juntar dinheiro', 'I am saving up for a course abroad.'),
            ('abroad', 'no exterior / para o exterior', 'She would like to study abroad.'),
            ('look forward to', 'aguardar com entusiasmo', 'I look forward to meeting the team.'),
        ],
    },
    'B2': {
        'focus': 'Argumentação, trabalho e escolhas sustentáveis',
        'paragraphs': [
            'Working remotely can improve flexibility; however, it may also blur the boundary between work and personal life. Clear expectations help teams stay connected.',
            'If our city invested more in public transport, fewer people would rely on cars. This would reduce emissions and make neighbourhoods more accessible.',
            'The proposal has been revised following feedback from residents. While the benefits are substantial, its long-term costs should also be taken into account.',
        ],
        'prompts': ['Compare two advantages and one drawback of remote work.', 'Suggest a change to your city using a second conditional.', 'Evaluate a proposal and acknowledge a contrasting point of view.'],
        'mistakes': [('Despite it is flexible, it is demanding.', 'Although it is flexible, it is demanding.'), ('If the city would invest, pollution would fall.', 'If the city invested, pollution would fall.'), ('The proposal has revised yesterday.', 'The proposal was revised yesterday.')],
        'choices': [
            ('Choose the sentence with a correct contrast linker.', ['Despite the cost, the plan is useful.', 'Despite it costs, the plan is useful.', 'However the cost, the plan is useful.']),
            ('Complete: If transport were cheaper, more people ___ it.', ['would use', 'will using', 'had used']),
            ('Choose the correct passive form.', ['The proposal has been revised.', 'The proposal has revised.', 'The proposal has been revise.']),
        ],
        'words': [
            ('drawback', 'desvantagem', 'The main drawback is the lack of face-to-face contact.'),
            ('blur the boundary', 'tornar a fronteira pouco clara', 'Late messages can blur the boundary between work and home.'),
            ('accountability', 'responsabilidade de prestar contas', 'Clear goals improve accountability.'),
            ('sustainable', 'sustentável', 'We need a sustainable transport system.'),
            ('rely on', 'depender de / contar com', 'Many commuters rely on public transport.'),
            ('trade-off', 'compensação entre ganhos e perdas', 'There is a trade-off between cost and convenience.'),
            ('stakeholder', 'parte interessada', 'Every stakeholder should be heard.'),
            ('take into account', 'levar em consideração', 'We must take accessibility into account.'),
            ('substantial', 'considerável / significativo', 'The project requires substantial investment.'),
        ],
    },
    'C1': {
        'focus': 'Negociação, evidências e comunicação estratégica',
        'paragraphs': [
            'The findings suggest a correlation rather than a direct causal relationship. A more nuanced interpretation would acknowledge the limitations of the sample and the wider context.',
            'Had the team consulted stakeholders earlier, several objections might have been addressed before the launch. Nevertheless, there remains scope for a constructive compromise.',
            'While the proposed strategy is broadly sound, its implementation hinges on sustained collaboration. We should therefore establish measurable milestones without losing sight of the overarching objective.',
        ],
        'prompts': ['Interpret research findings cautiously and identify one limitation.', 'Reflect on an alternative past outcome using conditional inversion.', 'Recommend an implementation strategy with a concession and a clear priority.'],
        'mistakes': [('The evidence proves undoubtedly that everyone agrees.', 'The evidence suggests that a substantial proportion of respondents agree.'), ('Had they would consulted us, we could help.', 'Had they consulted us, we could have helped.'), ('The success hinges in collaboration.', 'Success hinges on collaboration.')],
        'choices': [
            ('Which wording appropriately hedges an inference?', ['The results appear to indicate a trend.', 'The results prove all cases forever.', 'The results must always explain everything.']),
            ('Choose the correct inverted conditional.', ['Had we known, we would have acted sooner.', 'Had we would know, we acted sooner.', 'Had we knew, we will act sooner.']),
            ('Complete: Implementation hinges ___ sustained collaboration.', ['on', 'at', 'in']),
        ],
        'words': [
            ('nuanced', 'que considera nuances', 'The report offers a nuanced account of the debate.'),
            ('caveat', 'ressalva', 'There is one important caveat to this conclusion.'),
            ('corroborate', 'corroborar / confirmar com evidências', 'Independent data corroborate the initial findings.'),
            ('scope for', 'margem para / possibilidade de', 'There is still scope for negotiation.'),
            ('concede', 'admitir um ponto / fazer uma concessão', 'I concede that the timeline is ambitious.'),
            ('address a concern', 'tratar de uma preocupação', 'The revised plan addresses the main concern.'),
            ('hinge on', 'depender essencialmente de', 'Success hinges on sustained cooperation.'),
            ('overarching', 'abrangente / principal', 'Our overarching objective is equitable access.'),
            ('milestone', 'marco de um projeto', 'The first milestone is a working prototype.'),
        ],
    },
    'C2': {
        'focus': 'Precisão retórica, registro e interpretação crítica',
        'paragraphs': [
            'The editorial pays lip service to transparency while leaving its central assumptions unexamined. Its polished rhetoric should not obscure the distinction between a plausible assertion and a substantiated claim.',
            'Far be it from me to dismiss the proposal outright; nonetheless, its apparent pragmatism belies a rather tenuous evidential basis. A judicious revision could reconcile ambition with intellectual rigour.',
            'No sooner had the agreement been announced than competing interpretations began to emerge. What had been framed as a watershed moment turned out to be an incremental, albeit consequential, shift.',
        ],
        'prompts': ['Critique an editorial by distinguishing rhetoric from substantiated evidence.', 'Express a tactful but precise disagreement in a formal register.', 'Analyse a change using inversion and qualify its significance.'],
        'mistakes': [('The author literally destroys every possible argument.', 'The author challenges several central assumptions, though some objections remain unresolved.'), ('Far be from me dismissing the idea.', 'Far be it from me to dismiss the idea.'), ('No sooner the deal was signed when objections emerged.', 'No sooner had the deal been signed than objections emerged.')],
        'choices': [
            ('Which sentence distinguishes evidence from assertion most precisely?', ['The claim is plausible, but remains insufficiently substantiated.', 'The claim sounds nice, so it is incontrovertible.', 'The claim is controversial and therefore necessarily false.']),
            ('Choose the correct formal concessive expression.', ['Far be it from me to dismiss the proposal.', 'Far be from me dismissing the proposal.', 'Far it is from me dismiss the proposal.']),
            ('Complete: No sooner had the meeting ended ___ objections emerged.', ['than', 'when', 'that']),
        ],
        'words': [
            ('pay lip service to', 'apoiar apenas no discurso', 'The policy pays lip service to accountability.'),
            ('substantiated', 'fundamentado em evidências', 'Only substantiated claims belong in the conclusion.'),
            ('equivocal', 'ambíguo / inconclusivo', 'The response was deliberately equivocal.'),
            ('belie', 'contradizer a aparência de / desmentir', 'Her calm demeanour belied the urgency of the situation.'),
            ('tenuous', 'frágil / pouco convincente', 'The argument rests on a tenuous connection.'),
            ('judicious', 'criterioso / sensato', 'A judicious choice of examples strengthens the essay.'),
            ('watershed', 'divisor de águas', 'The ruling marked a watershed in public debate.'),
            ('albeit', 'embora / ainda que', 'The change was modest, albeit significant.'),
            ('reconcile', 'conciliar', 'The framework seeks to reconcile competing priorities.'),
        ],
    },
}


def _id(key):
    return uuid5(NAMESPACE_URL, 'best-part-school:mobile-demo:v1:' + key)


def _moment(anchor_date):
    if isinstance(anchor_date, datetime):
        return anchor_date if timezone.is_aware(anchor_date) else timezone.make_aware(anchor_date)
    return timezone.make_aware(datetime.combine(anchor_date, time(12)))


@transaction.atomic
def seed_student_content(student, teacher, lessons, anchor_date):
    """Return created-object counts; generated lessons must already belong to student."""
    content = LEVEL_CONTENT['A1/A2' if student.level in {'A1', 'A2'} else student.level]
    completed = [lesson for lesson in lessons if lesson.status == 'completed'][:3]
    if len(completed) < 3 or any(lesson.student_id != student.pk or lesson.teacher_id != teacher.pk for lesson in completed):
        raise ValueError('Demo content requires three completed lessons owned by the supplied student and teacher.')
    now = _moment(anchor_date)
    counts = dict(summaries=0, new_words=0, vocabulary_cards=0, review_logs=0, homework=0, questions=0, answers=0)
    categories = []
    for slug, name in [('vocabulary', 'Vocabulário das aulas'), ('expressions', 'Expressões em contexto'), ('grammar', 'Gramática e uso')]:
        category, _ = VocabularyCategory.objects.get_or_create(
            id=_id(f'content:{student.pk}:category:{slug}'),
            defaults={'owner': student, 'slug': f'demo-{slug}', 'name': name},
        )
        categories.append(category)

    states = [
        ('new', 0, 0, 0, 0, -1), ('weak', 22, 0, 3, 0, -2),
        ('learning', 48, 2, 1, 2, 0), ('stable', 78, 5, 0, 7, 4),
        ('mastered', 96, 9, 0, 21, 18), ('weak', 18, 0, 4, 0, -1),
        ('learning', 56, 3, 1, 3, -1), ('stable', 82, 6, 0, 10, 8),
        ('mastered', 100, 10, 0, 30, 25),
    ]
    for index, lesson in enumerate(completed):
        summary, created = LessonSummary.objects.get_or_create(
            lesson=lesson,
            defaults={
                'id': _id(f'content:{student.pk}:summary:{index}'), 'student': student, 'teacher': teacher,
                'summary': f"{content['focus']}. Praticamos {lesson.title.lower()} com leitura, conversa guiada e produção própria. {content['paragraphs'][index]}",
                'homework': content['prompts'][index],
                'observations': 'Boa participação e evolução na autonomia. Retome os exemplos e as correções antes da próxima aula.',
                'raw_ai_response': {'source': 'offline_mobile_demo', 'generated_by_ai': False},
            },
        )
        counts['summaries'] += int(created)
        if created:
            lesson.notes = (
                f"<h2>{escape(lesson.title)}</h2><p><strong>Objetivo:</strong> {escape(content['focus'])}.</p>"
                f"<h3>Language in context</h3><p>{escape(content['paragraphs'][index])}</p>"
                f"<h3>Teacher's notes</h3><ul><li>Leia o exemplo em voz alta e destaque as expressões novas.</li>"
                f"<li>{escape(content['prompts'][index])}</li></ul>"
                f"<blockquote>{escape(content['mistakes'][index][1])}</blockquote>"
                '<p><strong>Próximo passo:</strong> revise seus flashcards e conclua a prática da aula.</p>'
            )
            lesson.save(update_fields=['notes', 'updated_at'])
        mistake, correction = content['mistakes'][index]
        LessonSummaryMistake.objects.get_or_create(
            id=_id(f'content:{student.pk}:mistake:{index}'),
            defaults={'lesson_summary': summary, 'mistake': mistake, 'correction': correction},
        )
        LessonSummaryNextTopic.objects.get_or_create(
            id=_id(f'content:{student.pk}:next-topic:{index}'),
            defaults={'lesson_summary': summary, 'topic': content['prompts'][(index + 1) % 3]},
        )
        for position in range(3):
            word_index = index * 3 + position
            word, translation, example = content['words'][word_index]
            legacy, created = NewWord.objects.get_or_create(
                id=_id(f'content:{student.pk}:word:{word_index}'),
                defaults={'lesson': lesson, 'word': word, 'meaning': translation, 'level': student.level,
                          'status': ['hard', 'medium', 'easy'][position]},
            )
            counts['new_words'] += int(created)
            LessonSummaryWord.objects.get_or_create(
                id=_id(f'content:{student.pk}:summary-word:{word_index}'),
                defaults={'lesson_summary': summary, 'word': word, 'meaning': translation},
            )
            difficulty, confidence, repetitions, failures, interval, due_days = states[word_index]
            reviewed_at = None if difficulty == 'new' else now + timedelta(days=due_days - max(1, interval))
            card, created = VocabularyCard.objects.get_or_create(
                id=_id(f'content:{student.pk}:card:{word_index}'),
                defaults={
                    'student': student, 'teacher': teacher, 'lesson': lesson, 'source_new_word': legacy,
                    'source_type': 'lesson', 'word': word, 'translation': translation,
                    'explanation': f"Expressão estudada em contexto no nível {student.level}. {example}",
                    'example_sentence': example, 'tags': [student.level, 'Demonstração', content['focus']],
                    'category': categories[position], 'favorite': word_index in {0, 3, 6},
                    'difficulty_level': difficulty, 'confidence_level': confidence, 'repetition_count': repetitions,
                    'failure_count': failures, 'interval_days': interval, 'mastered': difficulty == 'mastered',
                    'last_reviewed_at': reviewed_at, 'next_review_at': now + timedelta(days=due_days),
                    'easiness_factor': 1.8 if difficulty == 'weak' else 2.6,
                },
            )
            counts['vocabulary_cards'] += int(created)
            if reviewed_at:
                rating = 'hard' if difficulty == 'weak' else 'easy' if difficulty in {'stable', 'mastered'} else 'good'
                log, created = VocabularyReviewLog.objects.get_or_create(
                    id=_id(f'content:{student.pk}:review:{word_index}'),
                    defaults={
                        'card': card, 'student': student, 'rating': rating,
                        'review_quality': {'hard': 3, 'good': 4, 'easy': 5}[rating],
                        'previous_easiness_factor': 2.5, 'new_easiness_factor': card.easiness_factor,
                        'previous_interval_days': max(0, interval - 1), 'new_interval_days': interval,
                        'previous_repetition_count': max(0, repetitions - 1), 'new_repetition_count': repetitions,
                        'next_review_at': card.next_review_at,
                    },
                )
                counts['review_logs'] += int(created)
                if created:
                    VocabularyReviewLog.objects.filter(pk=log.pk).update(reviewed_at=reviewed_at)

    for index, status in enumerate(['corrected', 'sent', 'in_progress', 'pending']):
        _seed_homework(student, teacher, completed[min(index, 2)], content, index, status, now, counts)
    return counts


def _seed_homework(student, teacher, lesson, content, index, status, now, counts):
    topic = index % 3
    homework, created = Homework.objects.get_or_create(
        id=_id(f'content:{student.pk}:homework:{index}'),
        defaults={
            'student': student, 'teacher': teacher, 'lesson': lesson,
            'title': f"{['Revisão com feedback', 'Produção para o professor', 'Prática em andamento', 'Próximo desafio'][index]} — {content['focus']}",
            'description': f"Pratique as estruturas da aula. {content['prompts'][topic]} Responda com suas próprias ideias e revise as orientações do professor.",
            'classification': f'{student.level} · Grammar, vocabulary and writing', 'status': status,
            'due_date': now + timedelta(days=[-7, -2, 2, 5][index]),
            # Editable open-text worksheets use teacher correction; the live
            # auto-corrected worksheet below uses only offline multiple choice.
            'auto_correction_enabled': status in {'corrected', 'in_progress'},
            'teacher_feedback': 'Boa evolução! Use os exemplos da aula para revisar precisão e organização antes da próxima prática.' if status == 'corrected' else '',
        },
    )
    counts['homework'] += int(created)
    # Existing worksheets and all their edited questions/answers are preserved wholesale.
    if not created:
        return
    prompt, original_options = content['choices'][topic]
    options = original_options[index % 3:] + original_options[:index % 3]
    correct_index = options.index(original_options[0])
    word, translation, _ = content['words'][topic * 3]
    translations = [translation, content['words'][(topic * 3 + 1) % 9][1], content['words'][(topic * 3 + 2) % 9][1]]
    specs = [
        {'type': 'multiple_choice', 'prompt': prompt, 'options': options, 'correct_option_index': correct_index,
         'explanation': f"A forma correta é: {original_options[0]}", 'reference_answer': original_options[0]},
        {'type': 'open_text', 'prompt': content['prompts'][topic], 'options': [], 'correct_option_index': None,
         'reference_answer': content['paragraphs'][topic], 'explanation': content['mistakes'][topic][1]},
        {'type': 'multiple_choice', 'prompt': f'What does “{word}” mean in the context of this lesson?',
         'options': translations, 'correct_option_index': 0, 'reference_answer': translation,
         'explanation': f'Neste contexto, “{word}” significa “{translation}”.'},
    ]
    if status == 'in_progress':
        extra_prompt, extra_options = content['choices'][(topic + 1) % 3]
        specs[1] = {
            'type': 'multiple_choice', 'prompt': extra_prompt, 'options': extra_options,
            'correct_option_index': 0, 'reference_answer': extra_options[0],
            'explanation': f'A forma correta é: {extra_options[0]}',
        }
    for question_index, spec in enumerate(specs):
        question = HomeworkQuestion.objects.create(
            id=_id(f'content:{student.pk}:homework:{index}:question:{question_index}'), homework=homework,
            order=question_index + 1, second_chance_mode='reserve',
            reserve_type=spec['type'], reserve_prompt=f"Try again: {spec['prompt']}",
            reserve_options=spec['options'], reserve_correct_option_index=spec['correct_option_index'],
            reserve_reference_answer=spec['reference_answer'], reserve_explanation=spec['explanation'],
            correction_instructions='Avalie o sentido e a estrutura trabalhada. Aceite respostas próprias equivalentes.', **spec,
        )
        counts['questions'] += 1
        if status == 'pending' or (status == 'in_progress' and question_index == 2):
            continue
        is_correct = None if status == 'sent' else question_index == 0
        answer_defaults = {
            'homework': homework, 'question': question, 'student': student,
            'answer_text': (content['paragraphs'][topic] if status == 'sent' else content['mistakes'][topic][0]) if question.type == 'open_text' else '',
            'selected_option_index': (question.correct_option_index if question_index == 0 or status == 'sent' else 1) if question.type == 'multiple_choice' else None,
            'answered_at': now - timedelta(days=3 if status == 'corrected' else 1), 'is_correct': is_correct,
        }
        if status != 'sent':
            answer_defaults.update(
                auto_feedback='Muito bem! Você aplicou a estrutura corretamente.' if is_correct else 'Revise o modelo e tente mais uma vez.',
                auto_explanation=spec['explanation'], expected_answer=spec['reference_answer'],
                correction_metadata={'source': 'offline_mobile_demo', 'second_chance_question': None if is_correct else {
                    'type': question.reserve_type, 'prompt': question.reserve_prompt,
                    'options': question.reserve_options, 'correct_option_index': question.reserve_correct_option_index,
                    'reference_answer': question.reserve_reference_answer, 'explanation': question.reserve_explanation,
                }},
            )
        if status == 'corrected':
            answer_defaults['teacher_feedback'] = 'Compare sua resposta com o exemplo e observe a estrutura destacada.'
            if not is_correct:
                recovered = question_index == 1
                answer_defaults.update(
                    second_chance_answer_text=(spec['reference_answer'] if recovered else 'I am still reviewing this expression.') if question.type == 'open_text' else '',
                    second_chance_selected_option_index=(question.reserve_correct_option_index if recovered else 1) if question.type == 'multiple_choice' else None,
                    second_chance_is_correct=recovered, second_chance_answered_at=now - timedelta(days=2),
                    second_chance_feedback='Ótima correção! A segunda tentativa está correta.' if recovered else 'Vamos retomar esta expressão na próxima aula.',
                    second_chance_explanation=spec['explanation'], second_chance_expected_answer=spec['reference_answer'],
                )
        HomeworkAnswer.objects.create(id=_id(f'content:{student.pk}:homework:{index}:answer:{question_index}'), **answer_defaults)
        counts['answers'] += 1
    if status == 'corrected':
        # Pure aggregation only: this method never contacts an AI provider.
        homework.student_report = HomeworkAutoCorrectionService.build_report(homework, student)
        homework.student_report['generated_at'] = (now - timedelta(days=2)).isoformat()
        homework.report_generated_at = now - timedelta(days=2)
        homework.save(update_fields=['student_report', 'report_generated_at'])
