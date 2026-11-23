# Speaking com IA — Fase 1

O Speaking de `AssistenteIA` usa `/api/ai-study/sessions/`. O módulo antigo `/api/practice/` não é utilizado por essa tela e permanece separado. Esta entrega implementa o motor da Fase 1.

## Arquitetura e estado

- `backend/ai_study/speaking.py`: políticas A1–C2, contratos Pydantic, validação de planos, transições e composição do conteúdo pedagógico. Não depende de Django nem do cliente de IA.
- `backend/ai_study/services.py`: integração com o provedor existente e orquestração/persistência. Mantém o modelo `gpt-4o` e os padrões de chamadas já utilizados. Os contratos seguem o formato de [Structured Outputs da OpenAI Docs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=chat).
- `backend/ai_study/guided_tutor.py`: reaproveita onboarding e botões existentes, apresenta a preparação inicial e permite escolher outra situação. Os roteiros fixos antigos do Speaking foram removidos.
- `backend/ai_study/views.py`: conecta o envio de áudio ao mesmo motor usado para texto.
- `src/lib/aiStudy.ts`: tipa o estado pedagógico retornado pela API.
- `src/pages/AssistenteIA.tsx`: mantém a interface existente e mostra apenas a etapa atual e o nível. Aceita áudio sem avaliação acústica (`feedback: null`).
- `backend/ai_study/test_speaking.py` e `backend/ai_study/tests.py`: testes do motor, contratos e integração; atualização das expectativas do Speaking antigo.

O `guided_state.stage` existente continua controlando onboarding/atividade/resumo. Dentro dele, `guided_state.speaking.phase` controla `LEARN → PRACTICE → SIMULATE → FEEDBACK`. A demonstração pertence a LEARN. O JSONField existente evita uma nova tabela ou migração.

O estado guarda plano, situação selecionada, papéis, objetivo, sequência e ramificações, nível, etapa, progresso, pergunta pendente, exemplos apresentados, vocabulário utilizado, dificuldades com evidências e ajudas utilizadas. O histórico completo continua em `AIConversationMessage`; os 16 últimos registros são enviados ao tutor junto com o estado persistido. Conversas antigas recebem um plano na próxima interação e conservam as mensagens existentes.

## Regras pedagógicas

Cada cenário, inclusive um tema personalizado, gera duas ou três situações concretas, com três a seis acontecimentos cada. O aluno pode aceitar a primeira ou escolher outra antes de iniciar a prática. Contextos vagos, identificadores duplicados, ramificações inválidas, exemplos excessivamente longos e traduções ausentes são rejeitados.

As políticas de nível controlam idioma de instrução, vocabulário, gramática, tamanho das mensagens e frases, apoio e complexidade da simulação. A1/A2 recebem apresentação em português, exemplos traduzidos e perguntas com tradução. A progressão exige preparação; botões nunca demonstram domínio.

Na prática, A1/A2 precisam de duas respostas adequadas; B1–C2 precisam de uma. Uma resposta classificada como domínio pode acelerar essa passagem, com evidência citada da resposta real. Duas dificuldades consecutivas retornam à preparação/prática com orientação para outro exemplo mais simples, mantendo a posição na situação. Durante a simulação, o motor aceita apenas ramificações do plano; o encerramento conduz a FEEDBACK. O fechamento existente também permite encerrar antecipadamente e retomar.

As ajudas existentes de vocabulário, gramática e treino de pronúncia registram o uso e preservam a pergunta pendente. Não contam como tentativas de resposta. O conjunto completo de ajudas e as microatividades com ponto de retorno pertencem às próximas fases.

O provedor propõe conteúdo e observações; o servidor valida a transição antes de persistir ou exibir. Uma resposta inválida recebe uma tentativa de correção. Se continuar inválida, ou o provedor estiver indisponível, a API retorna 503 e preserva o progresso. Mensagens e estado são gravados na mesma transação; as atualizações de Speaking usam bloqueio da sessão no banco.

## Capacidade de áudio

O gravador e o serviço de transcrição existentes são reaproveitados. O texto transcrito entra no mesmo motor pedagógico, preservando o áudio da mensagem do aluno. A infraestrutura atual não entrega evidências acústicas ao avaliador: esta rota não cria notas de pronúncia, entonação ou fluência a partir da transcrição. Os feedbacks antigos e suas rotas de consulta/reprodução permanecem disponíveis. Transcrição vazia ou indisponível informa uma alternativa por texto e não avança a sessão.

## Validação

Os testes de integração usam respostas controladas do provedor e SQLite em memória. Não foram feitas chamadas reais à IA nem validação física do microfone.

```sh
DATABASE_URL='' DB_ENGINE=django.db.backends.sqlite3 DB_NAME=:memory: OPENAI_API_KEY=test DJANGO_ALLOWED_HOSTS=testserver backend/venv/bin/python backend/manage.py test ai_study.test_speaking ai_study.tests --noinput
npm test -- --reporter=dot
npm run build
npx eslint src/lib/aiStudy.ts src/pages/AssistenteIA.tsx
DATABASE_URL='' DB_ENGINE=django.db.backends.sqlite3 DB_NAME=:memory: OPENAI_API_KEY=test backend/venv/bin/python backend/manage.py makemigrations --check --dry-run
```

Cobertura: seis níveis, cenários predefinidos e personalizados, Aula de Jiu-Jitsu no A1, escolha de situação, avaliação de nível existente, demonstração e prática obrigatórias, domínio e dificuldades, progresso e ramificações, FEEDBACK, recuperação de estado, ajudas existentes, troca de cenário, resumo/retomada/encerramento, permissões existentes, áudio e falhas com rollback. O lint dos arquivos alterados, o build, os testes e a verificação de migrações passaram.

`npm run lint` global encontra problemas anteriores em outros arquivos e também percorre `.worktrees/production`. `npx tsc --noEmit -p tsconfig.app.json` encontra erros anteriores em `AppSidebar.tsx` (propriedade `description`) e `Calendario.tsx` (comparação de papéis). Essas correções estão fora desta fase.

## Próximas fases

A Fase 2 poderá adicionar as microatividades de vocabulário e repetição oral. Permanecem para as fases seguintes o conjunto completo de ajudas, a interface conversacional progressiva, reprodução contextual, avaliação acústica com dados adequados e o relatório pedagógico detalhado do professor. A qualidade linguística das respostas geradas precisa de homologação com o provedor real; os testes automatizados validam contratos e regras do motor.
