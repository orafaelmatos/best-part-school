# Speaking com IA — Fase 2

Esta entrega adiciona vocabulário contextualizado e prática guiada ao motor da Fase 1. Os contratos `ScenarioPlan`, `TutorTurn`, mensagens, sessão, envio de texto e envio de áudio permanecem compatíveis. As fases LEARN/PRACTICE/SIMULATE/FEEDBACK continuam iguais.

## Fluxo implementado

1. WORD: uma expressão e sua tradução em português para A1/A2; tradução disponível por escolha nos níveis seguintes.
2. EXAMPLE: exemplo contextualizado e sua tradução. Palavra/expressão e frase têm ações de áudio independentes.
3. REPEAT: solicitação de repetição no gravador existente, com entrada por texto como alternativa.
4. FEEDBACK: retorno curto sobre o conteúdo da resposta, com dica, outra demonstração quando houver dificuldade e avanço gradual.
5. GUIDED: pergunta contextual com modelo de resposta e tradução, usando o vocabulário já apresentado.

A1/A2 passam por duas expressões antes das respostas guiadas; B1–C2 podem chegar à prática após uma. O domínio numa resposta contextual pode acelerar o avanço. Repetir um modelo, pedir ajuda ou clicar em botões não comprova domínio contextual.

Cada exercício tem até três tentativas. Dificuldade repetida na repetição exige outro exemplo traduzido; ao esgotar as tentativas, o motor registra revisão e passa a outra expressão. Na prática contextual, dificuldades levam à revisão com outra atividade. Perguntas guiadas anteriores são preservadas para evitar gerar continuamente o mesmo exercício. O motor exige duas respostas adequadas para iniciantes ou uma resposta contextual classificada como domínio antes de liberar a simulação. A passagem para a simulação reutiliza o tutor da Fase 1.

As ações de ouvir e pedir dica não gastam tentativas. A preparação e a posição da situação ficam persistidas para recuperação. Sessões antigas ainda em LEARN/PRACTICE recebem a preparação; sessões que já chegaram à simulação continuam no fluxo existente. Escolher outra situação ou cenário reinicia as microetapas daquele contexto.

## Arquivos e decisões

- `backend/ai_study/speaking_preparation.py`: microetapas e contratos próprios de tarefa/observação, separados do provedor e da interface. Usa o vocabulário do plano existente, sem regras por cenário.
- `backend/ai_study/speaking.py`: proteção contra avanço para simulação com preparação pendente e reutilização da identificação de expressões observadas.
- `backend/ai_study/services.py`: integração das microetapas, geração/validação das tarefas, avaliação de respostas, persistência transacional e geração de áudio existente.
- `backend/ai_study/guided_tutor.py`: apresentação inicial progressiva e metadados da atividade.
- `backend/ai_study/serializers.py` e `backend/ai_study/views.py`: endpoint adicional `POST /api/ai-study/sessions/{id}/vocabulary-audio/`, com `message_id` e `part: word|example`. O texto vem da mensagem persistida e autorizada, não de um texto arbitrário enviado pelo cliente.
- `src/lib/aiStudy.ts`: tipos adicionais opcionais para `speaking.preparation` e atividade apresentada em `metadata.speaking_activity`.
- `src/components/SpeakingVocabularyActivity.tsx`: apresentação de uma expressão por vez, exemplos, tradução, áudio e acesso ao gravador existente.
- `src/components/VocabularyAudioButton.tsx`: capacidade opcional de solicitar áudio de outra fonte, preservando a chamada existente de cartões de vocabulário. Exibe alternativa por texto em falhas e interrompe a reprodução ao desmontar.
- `src/pages/AssistenteIA.tsx`: exibe a atividade na conversa e conecta a repetição ao gravador já usado pela página.
- `backend/ai_study/test_speaking_preparation.py`, `backend/ai_study/test_speaking.py`, `src/components/SpeakingVocabularyActivity.test.tsx` e `src/pages/AssistenteIA.test.tsx`: cobertura nova e adaptação das fixtures da Fase 1 para isolar o tutor após a preparação.

O estado adicional usa o JSONField existente; não há migração. `guided_action` mantém seu formato, recebendo `action_type: preparation` e valores `next|retry|hint`. A geração de áudio usa o serviço TTS existente, sob demanda, com cache por texto por até 24 horas. A reprodução não altera o progresso da sessão. Mensagens antigas sem os metadados novos continuam sendo exibidas normalmente.

A avaliação recebe texto ou transcrição, com evidência citada da resposta do aluno. Ela não atribui notas acústicas nem afirma avaliar pronúncia. As rotas existentes de texto/áudio mantêm o formato de resposta da Fase 1, incluindo `feedback: null` no envio de áudio. Falhas de transcrição ou geração não devem avançar a atividade; falhas de reprodução oferecem a continuação pelo texto.

## Validação

Passaram 84 testes do backend e 42 testes do frontend, além do build, lint dos arquivos alterados e verificação de migrações.

```sh
DATABASE_URL='' DB_ENGINE=django.db.backends.sqlite3 DB_NAME=:memory: OPENAI_API_KEY=test DJANGO_ALLOWED_HOSTS=testserver backend/venv/bin/python backend/manage.py test ai_study.test_speaking_preparation ai_study.test_speaking ai_study.tests --noinput
npm test -- --reporter=dot --maxWorkers=1
npm run build
npx eslint src/lib/aiStudy.ts src/pages/AssistenteIA.tsx src/pages/AssistenteIA.test.tsx src/components/VocabularyAudioButton.tsx src/components/SpeakingVocabularyActivity.tsx src/components/SpeakingVocabularyActivity.test.tsx
DATABASE_URL='' DB_ENGINE=django.db.backends.sqlite3 DB_NAME=:memory: OPENAI_API_KEY=test backend/venv/bin/python backend/manage.py makemigrations --check --dry-run
```

Cobertura: microetapas, traduções A1–C2, Aula de Jiu-Jitsu no A1, voz e texto, dicas sem consumir tentativas, limite de repetição, exemplos alternativos, prática com vocabulário apresentado, avanço por domínio, recuperação após recarregamento, troca de cenário, preparação obrigatória, transição para o tutor existente, contratos inválidos com rollback, permissões de áudio, cache, falhas de TTS/reprodução e compatibilidade com áudio dos cartões existentes.

O frontend foi validado com um processo de testes por vez: a execução paralela teve timeout num teste anterior de agenda, que passou na execução sequencial. A checagem completa de TypeScript continua encontrando os dois erros anteriores em `AppSidebar.tsx` e `Calendario.tsx`; os arquivos alterados não acrescentaram erros nessa checagem.

Os testes usam respostas controladas do provedor e SQLite em memória. A qualidade linguística com o provedor real e a captura física do microfone ainda precisam de homologação. O conjunto completo de ajudas durante a simulação, seu ponto de retorno, a reformulação visual geral e os relatórios do professor permanecem nas fases seguintes.
