CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"]


def build_choice(
    choice_id,
    label,
    value,
    action_type,
    *,
    emoji="",
    description="",
    variant="secondary",
):
    return {
        "id": choice_id,
        "label": label,
        "value": value,
        "action_type": action_type,
        "emoji": emoji,
        "description": description,
        "variant": variant,
    }


SCENARIO_OPTIONS = [
    build_choice("restaurant", "Restaurante", "restaurant", "scenario", emoji="🍽", description="Pedir mesa, comida, bebida e fechar a conta.", variant="card"),
    build_choice("hotel", "Hotel", "hotel", "scenario", emoji="🏨", description="Fazer check-in, pedir informacoes e resolver problemas no quarto.", variant="card"),
    build_choice("airport", "Aeroporto", "airport", "scenario", emoji="✈️", description="Check-in, portao, bagagem e perguntas de viagem.", variant="card"),
    build_choice("taxi", "Taxi / Uber", "taxi", "scenario", emoji="🚕", description="Explicar destino, rota, tempo e pagamento.", variant="card"),
    build_choice("supermarket", "Supermercado", "supermarket", "scenario", emoji="🛒", description="Perguntar onde ficam produtos, quantidades e precos.", variant="card"),
    build_choice("shopping", "Shopping", "shopping", "scenario", emoji="🛍", description="Experimentar roupas, tamanhos, trocas e compras.", variant="card"),
    build_choice("hospital", "Hospital", "hospital", "scenario", emoji="🏥", description="Descrever sintomas, pedir ajuda e entender orientacoes.", variant="card"),
    build_choice("job_interview", "Entrevista de emprego", "job_interview", "scenario", emoji="💼", description="Falar sobre experiencia, habilidades e objetivos.", variant="card"),
    build_choice("work", "Trabalho", "work", "scenario", emoji="👨‍💼", description="Reunioes, tarefas, prazos e conversas profissionais.", variant="card"),
    build_choice("university", "Universidade", "university", "scenario", emoji="🎓", description="Aulas, apresentacoes, colegas e professores.", variant="card"),
    build_choice("cafeteria", "Cafeteria", "cafeteria", "scenario", emoji="☕", description="Fazer pedidos rapidos e conversar de forma casual.", variant="card"),
    build_choice("friends", "Conversa com amigos", "friends", "scenario", emoji="🎉", description="Conversas leves sobre rotina, gostos e planos.", variant="card"),
    build_choice("date", "Encontro", "date", "scenario", emoji="❤️", description="Small talk natural, opinioes e perguntas pessoais.", variant="card"),
    build_choice("phone_call", "Telefonema", "phone_call", "scenario", emoji="📞", description="Ligar, pedir informacoes e confirmar detalhes.", variant="card"),
    build_choice("post_office", "Correios", "post_office", "scenario", emoji="📦", description="Enviar encomendas e perguntar sobre entrega.", variant="card"),
    build_choice("bank", "Banco", "bank", "scenario", emoji="🏦", description="Servicos, documentos, cartoes e pagamentos.", variant="card"),
    build_choice("emergency", "Emergencia", "emergency", "scenario", emoji="🚔", description="Pedir ajuda, explicar urgencia e entender instrucoes.", variant="card"),
    build_choice("cinema", "Cinema", "cinema", "scenario", emoji="🎬", description="Comprar ingresso, escolher assentos e comentar filmes.", variant="card"),
    build_choice("tourism", "Turismo", "tourism", "scenario", emoji="🏖", description="Perguntar direcoes, passeios e recomendacoes.", variant="card"),
    build_choice("free_conversation", "Conversacao livre", "free_conversation", "scenario", emoji="🗣", description="Treino guiado com temas do dia a dia.", variant="card"),
    build_choice("custom", "Outro cenario", "custom", "scenario", emoji="➕", description="Escolher um contexto especifico para praticar.", variant="card"),
]

LEVEL_OPTIONS = [
    build_choice(level.lower(), level, level, "level", variant="chip")
    for level in CEFR_LEVELS
] + [
    build_choice(
        "unknown_level",
        "Nao sei meu nivel",
        "unknown",
        "level",
        description="Faremos uma avaliacao rapida com 3 perguntas.",
        variant="chip",
    )
]

LEVEL_ASSESSMENT_QUESTIONS = [
    {
        "id": "intro",
        "prompt": "Escreva 2 ou 3 frases se apresentando em ingles.",
        "helper_text": "Fale seu nome, rotina ou interesses.",
    },
    {
        "id": "past_event",
        "prompt": "Conte em ingles o que voce fez ontem ou no ultimo fim de semana.",
        "helper_text": "Use 2 ou 4 frases completas.",
    },
    {
        "id": "opinion",
        "prompt": "Explique em ingles qual e a melhor forma de aprender ingles e por que.",
        "helper_text": "Tente conectar ideias com because, but, so ou outras estruturas.",
    },
]

MODE_ACTION_LIBRARY = {
    "speaking": {
        "continue": build_choice("continue", "Continuar", "continue", "quick_action", variant="primary"),
        "new_challenge": build_choice("new_challenge", "Novo desafio", "new_challenge", "quick_action"),
        "vocabulary": build_choice("vocabulary", "Aprender vocabulario", "vocabulary", "quick_action"),
        "grammar": build_choice("grammar", "Explicar gramatica", "grammar", "quick_action"),
        "simulation": build_choice("simulation", "Simular situacao", "simulation", "quick_action"),
        "increase_difficulty": build_choice("increase_difficulty", "Aumentar dificuldade", "increase_difficulty", "quick_action"),
        "change_scenario": build_choice("change_scenario", "Mudar cenario", "change_scenario", "session_control", variant="outline"),
        "end_session": build_choice("end_session", "Encerrar sessao", "end_session", "session_control", variant="outline"),
        "retry": build_choice("retry", "Responder novamente", "retry", "quick_action", variant="primary"),
        "pronunciation": build_choice("pronunciation", "Treinar pronuncia", "pronunciation", "quick_action"),
    },
    "writing": {
        "continue": build_choice("continue", "Continuar", "continue", "quick_action", variant="primary"),
        "new_challenge": build_choice("new_challenge", "Novo desafio", "new_challenge", "quick_action"),
        "exercise": build_choice("exercise", "Fazer exercicio", "exercise", "quick_action"),
        "vocabulary": build_choice("vocabulary", "Aprender vocabulario", "vocabulary", "quick_action"),
        "grammar": build_choice("grammar", "Explicar gramatica", "grammar", "quick_action"),
        "simulation": build_choice("simulation", "Simular situacao", "simulation", "quick_action"),
        "increase_difficulty": build_choice("increase_difficulty", "Aumentar dificuldade", "increase_difficulty", "quick_action"),
        "change_scenario": build_choice("change_scenario", "Mudar cenario", "change_scenario", "session_control", variant="outline"),
        "end_session": build_choice("end_session", "Encerrar sessao", "end_session", "session_control", variant="outline"),
        "retry": build_choice("retry", "Responder novamente", "retry", "quick_action", variant="primary"),
    },
    "listening": {
        "continue": build_choice("continue", "Continuar", "continue", "quick_action", variant="primary"),
        "new_challenge": build_choice("new_challenge", "Novo audio", "new_challenge", "quick_action"),
        "change_scenario": build_choice("change_scenario", "Mudar cenario", "change_scenario", "session_control", variant="outline"),
        "end_session": build_choice("end_session", "Encerrar sessao", "end_session", "session_control", variant="outline"),
    },
}

SUMMARY_ACTIONS = [
    build_choice("continue_session", "Continuar", "continue_session", "session_control", variant="primary"),
    build_choice("review_summary", "Revisar", "review_summary", "quick_action"),
    build_choice("new_scenario", "Novo cenario", "new_scenario", "session_control"),
    build_choice("finalize_session", "Encerrar", "finalize_session", "session_control", variant="outline"),
]

SPEAKING_SCENARIO_TASKS = {
    "restaurant": "Voce chegou a um restaurante e quer pedir uma mesa para duas pessoas. Responda em ingles com 1 ou 2 frases, ou envie um audio.",
    "hotel": "Voce acabou de chegar ao hotel. Faca seu check-in em ingles com 2 frases curtas.",
    "airport": "Voce precisa perguntar onde fica seu portao. Diga sua pergunta em ingles.",
    "taxi": "Explique ao motorista para onde voce vai e pergunte quanto tempo a viagem vai levar.",
    "hospital": "Descreva rapidamente o que voce esta sentindo em ingles.",
    "job_interview": "Responda em ingles: Tell me about yourself.",
    "work": "Explique para um colega em ingles em que voce esta trabalhando hoje.",
    "university": "Pergunte ao professor em ingles sobre uma atividade ou prazo.",
    "cafeteria": "Faca um pedido simples em ingles e escolha sua bebida.",
    "friends": "Comece uma conversa natural com um amigo sobre seu fim de semana.",
    "date": "Abra uma conversa leve e natural em ingles durante um encontro.",
    "phone_call": "Atenda o telefonema em ingles e diga o motivo da ligacao.",
    "bank": "Explique em ingles qual servico voce precisa no banco.",
    "emergency": "Peca ajuda em ingles e explique rapidamente o problema.",
    "cinema": "Pergunte em ingles sobre o horario de um filme ou sobre os assentos.",
    "tourism": "Pergunte em ingles como chegar a um ponto turistico.",
    "free_conversation": "Fale em ingles sobre seu dia, seus planos ou um tema que voce goste. Use 2 ou 3 frases.",
}

WRITING_SCENARIO_TASKS = {
    "restaurant": "Escreva em ingles uma mensagem curta fazendo um pedido e pedindo uma recomendacao do cardapio.",
    "hotel": "Escreva em ingles um pedido curto para o hotel, como late check-out ou toalhas extras.",
    "airport": "Escreva em ingles uma pergunta curta para a equipe do aeroporto sobre embarque ou bagagem.",
    "taxi": "Escreva em ingles uma mensagem curta explicando seu destino e um pedido para o motorista.",
    "hospital": "Escreva em ingles 3 frases descrevendo seus sintomas e pedindo orientacao.",
    "job_interview": "Escreva em ingles uma mini resposta para Tell me about yourself.",
    "work": "Escreva em ingles uma mensagem profissional curta atualizando uma tarefa.",
    "university": "Escreva em ingles um e-mail curto para um professor pedindo ajuda ou prazo extra.",
    "cafeteria": "Escreva em ingles um pedido curto com bebida, comida e preferencia.",
    "friends": "Escreva em ingles uma mensagem casual convidando um amigo para sair.",
    "date": "Escreva em ingles uma mensagem educada para combinar um encontro.",
    "phone_call": "Escreva em ingles o roteiro curto do que voce diria em um telefonema.",
    "bank": "Escreva em ingles uma mensagem curta explicando um problema com cartao ou conta.",
    "emergency": "Escreva em ingles uma mensagem curta pedindo ajuda urgente.",
    "cinema": "Escreva em ingles uma mensagem curta perguntando sobre ingressos ou horarios.",
    "tourism": "Escreva em ingles uma pergunta curta sobre um passeio ou direcao.",
    "free_conversation": "Escreva em ingles 4 ou 5 frases sobre sua rotina, opiniao ou um plano futuro.",
}

LISTENING_SCENARIO_TASKS = {
    "restaurant": "Ouça o audio e transcreva exatamente o pedido feito no restaurante.",
    "hotel": "Ouça o audio e transcreva a fala relacionada ao check-in ou ao quarto.",
    "airport": "Ouça o audio e transcreva a pergunta ou resposta dita no aeroporto.",
    "taxi": "Ouça o audio e transcreva a conversa curta com o motorista.",
    "hospital": "Ouça o audio e transcreva a descricao curta do problema ou orientacao.",
    "job_interview": "Ouça o audio e transcreva a resposta curta dita na entrevista.",
    "work": "Ouça o audio e transcreva a atualizacao profissional.",
    "university": "Ouça o audio e transcreva a pergunta ou resposta do contexto academico.",
    "cafeteria": "Ouça o audio e transcreva o pedido curto feito na cafeteria.",
    "friends": "Ouça o audio e transcreva a fala casual entre amigos.",
    "date": "Ouça o audio e transcreva a fala natural do encontro.",
    "phone_call": "Ouça o audio e transcreva o que foi dito na ligacao.",
    "bank": "Ouça o audio e transcreva o pedido ou problema dito no banco.",
    "emergency": "Ouça o audio e transcreva a fala urgente do contexto de emergencia.",
    "cinema": "Ouça o audio e transcreva a pergunta sobre horarios ou assentos.",
    "tourism": "Ouça o audio e transcreva a pergunta ou resposta ligada ao turismo.",
    "free_conversation": "Ouça o audio e transcreva a frase em ingles com o maximo de precisao.",
}


def build_listening_journey_step(step_id, label, prompt):
    return {
        "id": step_id,
        "label": label,
        "prompt": prompt,
    }


LISTENING_SCENARIO_JOURNEYS = {
    "airport": [
        build_listening_journey_step("arrival", "Chegada ao aeroporto", "O aluno acabou de chegar ao aeroporto e precisa entender os primeiros avisos e orientacoes."),
        build_listening_journey_step("check_in", "Check-in", "A conversa agora acontece no balcao de check-in, com confirmacao de voo, passaporte e assento."),
        build_listening_journey_step("baggage_drop", "Despacho de bagagem", "O foco passa para despacho de malas, peso da bagagem e etiquetas."),
        build_listening_journey_step("security", "Controle de seguranca", "Agora a interacao acontece na fila ou no controle de seguranca, com instrucoes curtas e objetivas."),
        build_listening_journey_step("gate_lookup", "Localizacao do portao", "O aluno precisa entender indicacoes sobre onde fica o portao de embarque."),
        build_listening_journey_step("boarding", "Entrada no aviao", "A etapa agora e o embarque, com fila, prioridade e conferencia do cartao de embarque."),
        build_listening_journey_step("in_flight", "Conversa dentro do aviao", "A fala acontece dentro do aviao, com pedidos simples, assento ou orientacoes da tripulacao."),
        build_listening_journey_step("deplaning", "Saida do aviao", "A situacao avanca para o desembarque e as orientacoes para sair da aeronave."),
        build_listening_journey_step("immigration", "Imigracao", "A conversa agora e na imigracao, com perguntas curtas sobre viagem, documentos e destino."),
        build_listening_journey_step("baggage_claim", "Retirada da bagagem", "A etapa final e encontrar a esteira correta e lidar com a retirada da bagagem."),
    ],
    "restaurant": [
        build_listening_journey_step("arrival", "Chegada ao restaurante", "O aluno esta chegando ao restaurante e precisa entender a recepcao inicial."),
        build_listening_journey_step("table", "Pedido de mesa", "O foco e pedir ou confirmar uma mesa, quantidade de pessoas e tempo de espera."),
        build_listening_journey_step("menu", "Leitura do cardapio", "Agora a conversa envolve cardapio, sugestoes e duvidas sobre pratos."),
        build_listening_journey_step("drinks", "Pedido de bebidas", "A fala acontece no momento de escolher bebidas e fazer pequenos ajustes no pedido."),
        build_listening_journey_step("meal", "Pedido principal", "A etapa avanca para pedir a comida principal e confirmar detalhes do prato."),
        build_listening_journey_step("bill", "Conta e encerramento", "A etapa final e pedir a conta, confirmar pagamento e encerrar a interacao."),
    ],
    "hotel": [
        build_listening_journey_step("arrival", "Chegada ao hotel", "O aluno acabou de chegar ao hotel e precisa entender a recepcao inicial."),
        build_listening_journey_step("check_in", "Check-in", "A conversa e no balcao de check-in, com nome da reserva, documentos e horario."),
        build_listening_journey_step("room_details", "Detalhes do quarto", "Agora a fala envolve numero do quarto, cafe da manha, elevador ou senha do wi-fi."),
        build_listening_journey_step("request", "Pedido ao hotel", "A etapa avanca para um pedido simples, como toalhas, travesseiros ou late check-out."),
        build_listening_journey_step("problem", "Resolver um problema", "A conversa foca em um problema no quarto e na solucao proposta pelo hotel."),
        build_listening_journey_step("check_out", "Check-out", "A etapa final e fechar a estadia, confirmar conta e horario de saida."),
    ],
    "work": [
        build_listening_journey_step("greeting", "Chegada ao trabalho", "O aluno ouve uma conversa curta do inicio do expediente."),
        build_listening_journey_step("task_update", "Atualizacao de tarefa", "A fala agora e uma atualizacao simples sobre o que precisa ser feito."),
        build_listening_journey_step("meeting", "Reuniao rapida", "A etapa avanca para uma reuniao curta com alinhamento e proximos passos."),
        build_listening_journey_step("problem", "Resolver um problema", "O contexto agora e lidar com um bloqueio, atraso ou ajuste necessario."),
        build_listening_journey_step("follow_up", "Retorno por mensagem ou fala", "A conversa foca em confirmar status, prazo ou expectativa."),
        build_listening_journey_step("wrap_up", "Fechamento do dia", "A etapa final e encerrar o dia com resumo, entrega ou combinados."),
    ],
    "job_interview": [
        build_listening_journey_step("welcome", "Inicio da entrevista", "O aluno ouve a abertura da entrevista e a apresentacao inicial."),
        build_listening_journey_step("introduction", "Apresentacao pessoal", "A conversa passa para perguntas sobre apresentacao e experiencia."),
        build_listening_journey_step("experience", "Experiencia profissional", "A etapa foca em experiencia anterior, habilidades e responsabilidades."),
        build_listening_journey_step("strengths", "Pontos fortes", "Agora a fala envolve qualidades, exemplos e competencias."),
        build_listening_journey_step("availability", "Disponibilidade e detalhes", "O contexto avanca para disponibilidade, formato de trabalho e expectativas."),
        build_listening_journey_step("closing", "Encerramento", "A etapa final e agradecer, confirmar proximos passos e encerrar a entrevista."),
    ],
    "friends": [
        build_listening_journey_step("greeting", "Inicio da conversa", "O aluno ouve a abertura de uma conversa casual entre amigos."),
        build_listening_journey_step("catch_up", "Colocar o papo em dia", "A fala envolve rotina recente, novidades e perguntas simples."),
        build_listening_journey_step("plans", "Combinar planos", "A etapa avanca para combinar algo, sugerir horario ou lugar."),
        build_listening_journey_step("preferences", "Gostos e opinioes", "O contexto agora e comentar preferencias e reacoes naturais."),
        build_listening_journey_step("change_of_plan", "Mudanca de plano", "A conversa foca em ajustar ou remarcar o combinado."),
        build_listening_journey_step("goodbye", "Encerramento", "A etapa final e se despedir e confirmar o proximo contato."),
    ],
    "phone_call": [
        build_listening_journey_step("answering", "Atender a ligacao", "O aluno ouve a abertura de um telefonema e a identificacao da pessoa."),
        build_listening_journey_step("purpose", "Motivo da ligacao", "A fala passa para explicar rapidamente o motivo da chamada."),
        build_listening_journey_step("details", "Confirmacao de detalhes", "A etapa envolve confirmar nomes, horarios, enderecos ou numeros."),
        build_listening_journey_step("clarification", "Pedido de esclarecimento", "Agora a conversa foca em pedir repeticao ou confirmar entendimento."),
        build_listening_journey_step("resolution", "Resolucao", "O contexto avanca para a solucao ou acordo principal da ligacao."),
        build_listening_journey_step("closing", "Encerrar a ligacao", "A etapa final e agradecer e finalizar a chamada."),
    ],
    "tourism": [
        build_listening_journey_step("arrival", "Chegada ao local", "O aluno acabou de chegar a um local turistico e precisa se orientar."),
        build_listening_journey_step("directions", "Pedir direcoes", "A fala agora envolve pedir ou entender direcoes."),
        build_listening_journey_step("tickets", "Ingressos ou acesso", "A etapa passa por comprar, confirmar ou retirar ingressos."),
        build_listening_journey_step("recommendations", "Pedir recomendacoes", "O contexto foca em pedir sugestoes, horarios ou pontos importantes."),
        build_listening_journey_step("problem", "Resolver um imprevisto", "A conversa agora trata de uma duvida, atraso ou desencontro."),
        build_listening_journey_step("wrap_up", "Encerramento do passeio", "A etapa final e fechar a experiencia e combinar o proximo passo."),
    ],
}


def build_default_listening_journey():
    return {
        "steps": [],
        "current_step_index": 0,
        "completed_step_ids": [],
        "current_step_status": "pending",
    }


def normalize_listening_journey(journey):
    normalized = build_default_listening_journey()
    if isinstance(journey, dict):
        normalized.update(journey)
    steps = []
    for step in normalized.get("steps") or []:
        if not isinstance(step, dict):
            continue
        step_id = str(step.get("id") or "").strip()
        label = str(step.get("label") or "").strip()
        prompt = str(step.get("prompt") or "").strip()
        if not step_id or not label:
            continue
        steps.append({
            "id": step_id,
            "label": label,
            "prompt": prompt,
        })
    normalized["steps"] = steps
    step_count = len(steps)
    try:
        current_step_index = int(normalized.get("current_step_index") or 0)
    except (TypeError, ValueError):
        current_step_index = 0
    normalized["current_step_index"] = max(0, min(current_step_index, max(step_count - 1, 0)))
    completed_step_ids = []
    seen = set()
    valid_step_ids = {step["id"] for step in steps}
    for step_id in normalized.get("completed_step_ids") or []:
        value = str(step_id or "").strip()
        if not value or value in seen or (valid_step_ids and value not in valid_step_ids):
            continue
        seen.add(value)
        completed_step_ids.append(value)
    normalized["completed_step_ids"] = completed_step_ids
    status = str(normalized.get("current_step_status") or "pending").strip().lower()
    normalized["current_step_status"] = status if status in {"pending", "active", "retry", "completed"} else "pending"
    return normalized


def build_listening_journey(scenario_key, scenario_label):
    template = LISTENING_SCENARIO_JOURNEYS.get(scenario_key)
    if template:
        return [dict(step) for step in template]
    base_label = str(scenario_label or "situacao").strip() or "situacao"
    return [
        build_listening_journey_step("arrival", f"Entrada em {base_label}", f"O aluno entra no contexto de {base_label} e precisa entender a primeira orientacao."),
        build_listening_journey_step("interaction", "Primeira interacao", f"A conversa principal comeca no contexto de {base_label}, com uma pergunta ou resposta curta."),
        build_listening_journey_step("clarification", "Esclarecimento", f"O aluno precisa entender um detalhe importante dentro do contexto de {base_label}."),
        build_listening_journey_step("resolution", "Resolucao", f"A etapa avanca para resolver a necessidade principal no contexto de {base_label}."),
        build_listening_journey_step("closing", "Encerramento", f"A experiencia termina com um fechamento natural dentro do contexto de {base_label}."),
    ]


def normalize_level_choice(value, fallback="A2"):
    normalized = str(value or "").strip().upper()
    return normalized if normalized in CEFR_LEVELS else fallback


def build_default_guided_state(mode, suggested_level="A2"):
    level = normalize_level_choice(suggested_level)
    expected_input = "audio_or_text" if mode == "speaking" else "text_submission"
    return {
        "enabled": mode in {"speaking", "writing", "listening"},
        "stage": "choose_scenario",
        "scenario_key": "",
        "scenario_label": "",
        "level": "",
        "level_source": "",
        "objective": "",
        "difficulty": "guided",
        "learned_words": [],
        "recurring_errors": [],
        "progress_summary": "",
        "recommended_next_step": "",
        "completed_activities": [],
        "assessment": {
            "questions": LEVEL_ASSESSMENT_QUESTIONS,
            "answers": [],
            "current_index": 0,
        },
        "current_task": "",
        "expected_input": expected_input,
        "input_placeholder": "",
        "last_activity_type": "onboarding",
        "session_status": "active",
        "summary_items": [],
        "preserve_level_on_scenario_change": False,
        "default_level_hint": level,
        "listening_journey": build_default_listening_journey(),
    }


def normalize_guided_state(mode, base_state, suggested_level="A2", migrate_to_active=False):
    state = build_default_guided_state(mode, suggested_level=suggested_level)
    if isinstance(base_state, dict):
        state.update(base_state)
        assessment = state.get("assessment") if isinstance(state.get("assessment"), dict) else {}
        base_assessment = build_default_guided_state(mode, suggested_level=suggested_level)["assessment"]
        base_assessment.update(assessment)
        state["assessment"] = base_assessment
        state["listening_journey"] = normalize_listening_journey(state.get("listening_journey"))
    if migrate_to_active and not state.get("scenario_label"):
        state["stage"] = "active"
        state["scenario_key"] = "free_conversation"
        state["scenario_label"] = "Conversacao livre"
        state["level"] = normalize_level_choice(state.get("level") or suggested_level)
        state["level_source"] = state.get("level_source") or "profile"
        state["objective"] = default_session_objective(mode, state["scenario_label"], state["level"])
        state["current_task"] = scenario_task_for_mode(mode, state["scenario_key"], state["scenario_label"])
        state["expected_input"] = "audio_or_text" if mode == "speaking" else "text_submission"
        state["input_placeholder"] = placeholder_for_expected_input(mode, state["expected_input"], state["current_task"])
        state["progress_summary"] = state.get("progress_summary") or "Sessao migrada para o modo guiado."
    state["learned_words"] = unique_items(state.get("learned_words"), limit=18)
    state["recurring_errors"] = unique_items(state.get("recurring_errors"), limit=18)
    state["completed_activities"] = unique_items(state.get("completed_activities"), limit=18)
    state["summary_items"] = unique_items(state.get("summary_items"), limit=8)
    if state.get("level"):
        state["level"] = normalize_level_choice(state["level"])
    state["listening_journey"] = normalize_listening_journey(state.get("listening_journey"))
    return state


def unique_items(items, limit=12):
    seen = set()
    cleaned = []
    for item in items or []:
        value = " ".join(str(item or "").split())
        if not value:
            continue
        key = value.lower()
        if key in seen:
            continue
        seen.add(key)
        cleaned.append(value)
        if len(cleaned) >= limit:
            break
    return cleaned


def find_scenario_option(value):
    for option in SCENARIO_OPTIONS:
        if option["value"] == value:
            return option
    return None


def parse_level_choice(text):
    value = str(text or "").strip().upper()
    if value in CEFR_LEVELS:
        return value
    if value in {"NAO SEI", "NÃO SEI", "I DON'T KNOW", "UNKNOWN"}:
        return "unknown"
    return None


def default_session_objective(mode, scenario_label, level):
    if mode == "speaking":
        return f"Ganhar confianca para falar em ingles no cenario {scenario_label} com recursos de nivel {level}."
    if mode == "listening":
        return f"Treinar escuta e transcricao em ingles no cenario {scenario_label} com recursos de nivel {level}."
    return f"Escrever em ingles com clareza no cenario {scenario_label} usando estruturas adequadas ao nivel {level}."


def guided_session_title(mode, scenario_label):
    prefix = "Speaking" if mode == "speaking" else "Interprete IA" if mode == "listening" else "Writing"
    if not scenario_label:
        return f"{prefix} Guiado"
    return f"{prefix} - {scenario_label}"


def scenario_task_for_mode(mode, scenario_key, scenario_label):
    if mode == "speaking":
        return SPEAKING_SCENARIO_TASKS.get(
            scenario_key,
            f"Imagine uma situacao de {scenario_label}. Responda em ingles com 1 ou 2 frases, ou envie um audio.",
        )
    if mode == "listening":
        return LISTENING_SCENARIO_TASKS.get(
            scenario_key,
            f"Ouça o audio em ingles sobre o cenario {scenario_label} e transcreva o que entender.",
        )
    return WRITING_SCENARIO_TASKS.get(
        scenario_key,
        f"Escreva em ingles uma resposta curta relacionada ao cenario {scenario_label}.",
    )


def placeholder_for_expected_input(mode, expected_input, current_task=""):
    if expected_input == "choice":
        return "Escolha uma opcao abaixo ou escreva se preferir."
    if expected_input == "chat":
        return "Escreva sua resposta ou pergunta em ingles."
    if expected_input == "audio_or_text":
        return current_task or "Responda em ingles ou envie um audio."
    if expected_input == "text_submission":
        if mode == "listening":
            return current_task or "Digite em ingles exatamente o que voce ouviu."
        return current_task or "Escreva sua resposta em ingles."
    return "Escreva sua resposta."


def build_guided_metadata(
    *,
    stage,
    choices=None,
    layout="chips",
    helper_text="",
    allow_free_text=True,
    input_placeholder="",
    expected_input="chat",
    current_task="",
    recommended_choice_id="",
    summary_items=None,
):
    return {
        "guided": True,
        "stage": stage,
        "choices": choices or [],
        "choice_layout": layout,
        "helper_text": helper_text,
        "allow_free_text": allow_free_text,
        "input_placeholder": input_placeholder,
        "expected_input": expected_input,
        "current_task": current_task,
        "recommended_choice_id": recommended_choice_id,
        "summary_items": summary_items or [],
    }


def scenario_prompt_message():
    text = "Vamos praticar ingles!\n\nPrimeiro escolha um cenario para nossa aula."
    metadata = build_guided_metadata(
        stage="choose_scenario",
        choices=SCENARIO_OPTIONS,
        layout="grid",
        helper_text="Voce tambem pode digitar um cenario livre a qualquer momento.",
        expected_input="choice",
        input_placeholder="Escolha um cenario ou escreva o seu.",
    )
    return text, metadata


def custom_scenario_prompt_message():
    text = "Qual cenario voce gostaria de praticar?"
    metadata = build_guided_metadata(
        stage="await_custom_scenario",
        choices=[],
        layout="chips",
        helper_text="Descreva o contexto que voce quer treinar. Exemplo: reuniao com cliente ou consulta medica.",
        expected_input="chat",
        input_placeholder="Digite o cenario que voce quer praticar.",
    )
    return text, metadata


def level_prompt_message(scenario_label, current_level=""):
    helper = f"Vamos usar o cenario {scenario_label}." if scenario_label else "Agora vamos definir seu nivel."
    if current_level:
        helper += f" Seu nivel atual salvo e {current_level}."
    text = "Agora escolha seu nivel."
    metadata = build_guided_metadata(
        stage="choose_level",
        choices=LEVEL_OPTIONS,
        layout="chips",
        helper_text=helper,
        expected_input="choice",
        input_placeholder="Escolha um nivel ou digite A1, A2, B1, B2, C1 ou C2.",
    )
    return text, metadata


def level_assessment_message(question, current_index, total):
    text = (
        "Vamos fazer uma avaliacao rapida.\n\n"
        f"Pergunta {current_index + 1} de {total}:\n"
        f"{question['prompt']}"
    )
    metadata = build_guided_metadata(
        stage="level_assessment",
        choices=[],
        layout="chips",
        helper_text=question.get("helper_text", ""),
        expected_input="chat",
        input_placeholder="Escreva sua resposta em ingles.",
    )
    return text, metadata


def kickoff_message(mode, state):
    scenario_label = state.get("scenario_label") or "Conversacao livre"
    level = state.get("level") or state.get("default_level_hint") or "A2"
    current_task = state.get("current_task") or scenario_task_for_mode(mode, state.get("scenario_key"), scenario_label)
    support_choices = kickoff_support_choices(mode)
    expected_input = "audio_or_text" if mode == "speaking" else "text_submission"
    prompt_prefix = (
        f"Perfeito. Vamos trabalhar o cenario {scenario_label} no nivel {level}.\n\n"
        f"Objetivo da sessao: {state.get('objective') or default_session_objective(mode, scenario_label, level)}\n\n"
        f"Primeiro desafio:\n{current_task}\n\n"
        "Se precisar, escolha uma ajuda abaixo. Caso contrario, responda em ingles agora."
    )
    metadata = build_guided_metadata(
        stage="active",
        choices=support_choices,
        layout="chips",
        helper_text="A IA vai conduzir a aula e sugerir sempre o proximo passo.",
        expected_input=expected_input,
        current_task=current_task,
        input_placeholder=placeholder_for_expected_input(mode, expected_input, current_task),
    )
    return prompt_prefix, metadata


def kickoff_support_choices(mode):
    library = MODE_ACTION_LIBRARY[mode]
    order = ["continue", "vocabulary", "grammar", "simulation", "change_scenario"]
    return [library[item] for item in order if item in library]


def follow_up_choices_for_mode(mode, recommended="continue"):
    library = MODE_ACTION_LIBRARY[mode]
    if mode == "speaking":
        order = [recommended, "new_challenge", "vocabulary", "grammar", "change_scenario", "end_session"]
    else:
        order = [recommended, "exercise", "vocabulary", "grammar", "change_scenario", "end_session"]
    choices = []
    seen = set()
    for item in order:
        if item in seen or item not in library:
            continue
        seen.add(item)
        choices.append(library[item])
    return choices


def feedback_choices_for_mode(mode, low_performance=False):
    if low_performance:
        recommended = "retry"
    else:
        recommended = "new_challenge"
    return follow_up_choices_for_mode(mode, recommended=recommended)


def action_instruction_for_value(mode, value):
    library = {
        "continue": "Continue the lesson with the next best activity for the student.",
        "new_challenge": "Increase the challenge slightly and guide the student to the next activity.",
        "exercise": "Give the student a short practical exercise connected to the current scenario.",
        "vocabulary": "Teach a few high-value words for the current scenario and then ask the student to use them.",
        "grammar": "Explain the most relevant grammar point briefly and then ask the student to try again.",
        "simulation": "Run a realistic scenario simulation and keep leading the interaction.",
        "increase_difficulty": "Increase the difficulty while keeping the student supported.",
        "retry": "Ask the student to try again using the correction you just taught.",
        "pronunciation": "Focus on pronunciation coaching and give a short drill.",
        "review_summary": "Review what the student has learned so far and ask one short reinforcement task.",
    }
    return library.get(value, f"Guide the student through the next best step for {mode} mode.")


def summary_message_text(summary_items):
    lines = ["Hoje voce aprendeu:"]
    for item in summary_items:
        lines.append(f"- {item}")
    return "\n".join(lines)
