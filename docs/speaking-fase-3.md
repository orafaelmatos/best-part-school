# Speaking com IA — Fase 3

Esta entrega acrescenta continuidade da simulação, ajudas contextuais e retorno após vocabulário ao motor das Fases 1 e 2. Reutiliza os contratos `ScenarioPlan`, `Situation`, `TutorTurn`, `guided_action` e os modelos existentes. O estado adicional é opcional dentro de `guided_state.speaking.simulation`, sem migração.

## Continuidade e ramificações

A simulação persiste a última fala completa do tutor: pergunta em inglês, tradução, instrução, demonstração, feedback e início de resposta. “Continuar” apresenta esse conteúdo novamente sem pedir uma nova pergunta ao provedor e sem avançar a situação.

Respostas reais do aluno registram a pergunta respondida, etapa, resposta e evidência observada. Essa memória conserva as primeiras seis trocas e as dezoito mais recentes quando ultrapassa 24 registros, preservando apresentações e decisões iniciais mesmo depois que saem da janela de mensagens enviada ao provedor. As mensagens completas continuam no histórico existente.

O prompt usa a memória da simulação como referência principal do diálogo e distingue ações de ajuda e microatividades do diálogo com o personagem. Papéis, contexto, objetivo, posição na sequência e pergunta pendente continuam explícitos. Respostas positivas exigem uma ramificação indicada pelo provedor e pertencente ao acontecimento atual; não há seleção silenciosa da primeira ramificação. Perguntas repetidas que reiniciariam uma etapa já respondida são rejeitadas. END conduz a FEEDBACK com encerramento sem outra pergunta.

O estado registra o caminho das ramificações com evidências. Conforme as respostas adequadas se acumulam, o apoio automático passa de full para light/minimal, retirando inícios de resposta não solicitados. Todas as ajudas continuam disponíveis sob demanda. A avaliação continua restrita a conteúdo textual/transcrito.

## Ações disponíveis

| Ação | Comportamento |
| --- | --- |
| Não entendi | Explicação em português do sentido da fala pendente. |
| Me dê uma dica | Palavras ou início de resposta para a pergunta atual. |
| Ver tradução | Tradução da pergunta pendente; reutiliza a tradução salva quando disponível. |
| Ver exemplos | Duas ou três respostas possíveis, traduzidas e limitadas pelo nível. |
| Aprender vocabulário | Microatividade da Fase 2 usando vocabulário da pergunta/etapa atual, com ponto de retorno. |
| Repetir | Gera/reproduz a pergunta original em inglês pelo serviço TTS e componente de áudio existentes. |
| Explicar gramática | Explicação breve de uma estrutura relevante da fala pendente. |
| Novo desafio | Gera outra situação concreta dentro do mesmo cenário e nível, iniciando sua preparação. |
| Continuar | Recupera a última fala completa, preservando a pergunta e o progresso. |

As ajudas não contam como turnos respondidos, tentativas, acertos ou etapas concluídas. Pedidos de ajuda escritos ou transcritos também preservam a pergunta, mesmo que o provedor proponha outra. O uso das ajudas fica registrado. Contratos de ajuda vazios, exemplos excessivos/complexos e respostas inválidas do provedor são rejeitados com uma tentativa de correção e rollback caso a falha persista.

“Repetir” usa `POST /api/ai-study/sessions/{id}/simulation-audio/`, com `message_id`. O servidor confirma a sessão autorizada, pergunta, situação e etapa atuais; o cliente não envia texto arbitrário ao TTS. A reprodução reutiliza o cache de áudio e não cria uma resposta do aluno. Falhas de geração/reprodução oferecem continuação por texto. Uma mensagem de etapa anterior não pode pedir a reprodução de uma pergunta que deixou de estar pendente.

## Microatividade e recuperação

Ao abrir vocabulário, o motor guarda fase, posição, etapas concluídas, contadores, preparação anterior, pergunta e conteúdo da fala atual. A preparação usa o vocabulário da pergunta ou das respostas previstas no acontecimento atual, com alternativa para palavras ainda não praticadas no contexto.

Depois da repetição, a ação de continuar retorna à simulação; o aluno também pode escolher “Continuar simulação” antes de terminar a microatividade. O retorno restaura o ponto exato e os contadores da conversa. Vocabulário efetivamente usado, dificuldades observadas, exemplos apresentados e ajudas utilizadas durante a atividade permanecem registrados. Não há uma segunda pergunta de simulação gerada durante a retomada.

Duas dificuldades consecutivas na simulação abrem um reforço com o mesmo ponto de retorno. Pausar pelo resumo existente e continuar recupera a microatividade pendente antes de voltar ao diálogo. O estado é persistido e recuperado em cada requisição, mantendo as transações e o bloqueio de sessão já utilizados.

Novo desafio guarda a situação anterior completa, posição, fala e trocas recentes no histórico de desafios, limitado aos dez mais recentes. O plano ativo mantém o contrato original de duas ou três situações, com as anteriores recentes e a nova situação. As mensagens anteriores continuam disponíveis no histórico completo. IDs/contextos repetidos conhecidos são rejeitados. Trocar o cenário pelo fluxo existente inicia um novo plano.

## Arquivos deste incremento

- `backend/ai_study/speaking_simulation.py`: estado, memória, contratos de ajuda, validação de continuidade, ramificações, ponto de retorno e desafios.
- `backend/ai_study/services.py`: integração com o motor existente, prompts, ajudas, repetição, recuperação da microatividade e reutilização do cache TTS.
- `backend/ai_study/serializers.py` e `backend/ai_study/views.py`: contrato e endpoint de repetição da pergunta.
- `src/lib/aiStudy.ts`: tipos opcionais do estado da simulação.
- `src/components/SpeakingSimulationReplay.tsx` e `src/pages/AssistenteIA.tsx`: botão Repetir conectado ao áudio existente; demais ações reutilizam os botões guiados atuais, sem reformulação geral da interface.
- `backend/ai_study/test_speaking_simulation.py`: testes de continuidade, ajuda, preservação de estado, ramificações e falhas.
- `backend/ai_study/test_speaking.py`: fixtures de conversa passaram a oferecer perguntas distintas ao avançar entre acontecimentos.
- `src/components/SpeakingSimulationReplay.test.tsx` e `src/pages/AssistenteIA.test.tsx`: reprodução e integração das nove ações com a conversa.

Os metadados adicionais `speaking_simulation` informam a pergunta/etapa/situação atual para o botão de repetição. As outras ajudas usam `guided_action.action_type: simulation_help`; o formato existente da mensagem e da sessão permanece compatível. O retorno explícito da microatividade usa `value: resume_simulation`.

## Validação

Passaram 114 testes do backend, 46 testes do frontend, build, lint dos arquivos alterados e verificação de migrações.

```sh
DATABASE_URL='' DB_ENGINE=django.db.backends.sqlite3 DB_NAME=:memory: OPENAI_API_KEY=test DJANGO_ALLOWED_HOSTS=testserver backend/venv/bin/python backend/manage.py test ai_study.test_speaking_simulation ai_study.test_speaking_preparation ai_study.test_speaking ai_study.tests --noinput
npm test -- --reporter=dot --maxWorkers=1
npm run build
npx eslint src/lib/aiStudy.ts src/pages/AssistenteIA.tsx src/pages/AssistenteIA.test.tsx src/components/SpeakingSimulationReplay.tsx src/components/SpeakingSimulationReplay.test.tsx
DATABASE_URL='' DB_ENGINE=django.db.backends.sqlite3 DB_NAME=:memory: OPENAI_API_KEY=test backend/venv/bin/python backend/manage.py makemigrations --check --dry-run
```

Cobertura: ajudas A1–C2, Jiu-Jitsu A1, memória de apresentação, duas ramificações distintas, rejeição de ramificações inválidas/perguntas reiniciadas, fechamento, todas as ajudas, repetição em inglês sem consumir turno, acesso autorizado, pergunta obsoleta, falhas TTS/contratos, retorno após vocabulário, abandono da microatividade, resumo/retomada, reforço por dificuldade, novo desafio e preservação do contrato após vários desafios. Inclui regressão das duas fases anteriores.

A checagem completa de TypeScript permanece com os dois erros anteriores em `AppSidebar.tsx` e `Calendario.tsx`, sem erros novos nos arquivos alterados. Os testes usam respostas controladas do provedor e SQLite em memória. Permanecem pendentes a homologação linguística com o provedor real, uso de microfone/reprodução físicos e verificação de concorrência em PostgreSQL. A reformulação visual geral, avaliação acústica e acompanhamento detalhado do professor pertencem às fases seguintes.
