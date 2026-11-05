# Speaking com IA — Fase 5

O encerramento agora apresenta um resumo baseado nas respostas observadas, e o professor pode acompanhar as práticas na tela existente de aulas do aluno. Os contratos das Fases 1–4, transcrição, TTS e feedback legado continuam disponíveis.

## Feedback e evidências

Cada resposta avaliada registra, nos metadados da mensagem do assistente, a resposta real, trecho de evidência, origem escrita/transcrita, pergunta, fase, atividade, situação e progresso confirmado pelo motor. Ajudas, cliques, exemplos do professor e retornos à conversa não recebem crédito como respostas do aluno.

`speaking_reporting.py` calcula o relatório sem outra chamada ao provedor. O resumo contém:

- Frases utilizadas e origem da resposta.
- Vocabulário realmente encontrado nas respostas, com tradução e usos observados/adequados.
- Dificuldades observadas, com trechos de evidência.
- Pontos recorrentes: pelo menos duas observações do mesmo tipo e com a mesma explicação normalizada. Explicações diferentes não são agrupadas por suposição.
- Pontos positivos vinculados a respostas classificadas como adequadas ou com domínio naquela atividade.
- Recomendações vinculadas às dificuldades registradas ou à revisão das frases utilizadas.
- Atividades concluídas e situações com objetivo atingido, considerando os caminhos ramificados. Uma situação pode terminar sem percorrer todos os acontecimentos opcionais.

Vocabulário praticado não é apresentado como conhecimento necessariamente novo para o aluno. Encerrar sem responder produz um resumo sem acertos, palavras ou conclusões inventados. Os relatórios não atribuem nota, nível estimado, fluência, entonação ou qualidade de pronúncia a transcrições. O nível exibido é o escolhido para a prática. As avaliações de áudio antigas não são convertidas em novas avaliações acústicas.

## Persistência e ciclo da sessão

O modelo `SpeakingSessionReport` tem um registro por `(session, run_id)`, com restrição de unicidade, conteúdo JSON versionado, estado e datas. O `run_id` é persistido no motor e nas mensagens. Novos desafios conservam a mesma prática; trocar de cenário inicia outro registro, sem substituir os anteriores.

O relatório é atualizado com as observações e ajudas, e um snapshot é incluído na mensagem de fechamento. O aluno recebe o resumo ao atingir o objetivo da situação e ao pedir o encerramento. A fala de despedida do personagem permanece visível no fechamento natural.

Os estados distinguem `active`, `paused`, `situation_completed` e `completed`. Só o encerramento explícito marca a sessão como concluída e registra `completed_at`. Repetir esse comando conserva o registro e a data de conclusão. Depois de encerrar, o aluno pode escolher um novo cenário; respostas soltas não alteram a prática encerrada.

Pedir o resumo durante uma atividade guarda o ponto de retorno. Continuar recupera a mesma microetapa, sem consumir a atividade ou avançar para o próximo exemplo. Retornar à simulação conserva pergunta, histórico e ramificação. O reenvio de áudio continua usando a idempotência da Fase 4, sem duplicar evidências no relatório. Gravações obsoletas e contratos inválidos não alteram os registros de desempenho. As escritas permanecem nas transações e no bloqueio de sessão existentes.

## Acompanhamento do professor

`AlunoTrilha` incorpora a seção **Speaking com IA**, com histórico paginado, nível da prática, estado, contagens e detalhes do mesmo relatório exibido ao aluno. O professor pode consultar frases, vocabulário, dificuldades, pontos positivos, recomendações e situações concluídas. Isso não altera as habilidades ou o nível cadastrados no perfil do aluno.

`GET /api/ai-study/speaking-reports/` e `GET /api/ai-study/speaking-reports/{id}/` são somente leitura. A listagem aceita `student` e `session` (UUIDs) e usa a paginação existente. O aluno consulta os próprios dados; administradores consultam todos; professores consultam alunos vinculados por aulas individuais, turma atribuída ou aulas da turma. A mesma relação limita o acesso às sessões. Professores não podem enviar respostas ou modificar sessões de Speaking do aluno.

O endpoint existente `/api/ai-study/progress/overview/` recebe o campo aditivo `speaking_sessions`, com total de práticas/cenários, total encerrado e oito relatórios recentes. Os campos de recomendações e históricos anteriores permanecem compatíveis. No frontend, o cache desses relatórios inclui a identidade do professor e é descartado ao desmontar a consulta, evitando reutilização entre identidades.

## Ativação e dados anteriores

A migração aditiva `0008_speakingsessionreport` cria a tabela. Ela foi aplicada nos bancos isolados dos testes; o banco configurado do ambiente não foi alterado nesta implementação.

Na atualização do ambiente:

```sh
backend/venv/bin/python backend/manage.py migrate ai_study
backend/venv/bin/python backend/manage.py backfill_speaking_reports --dry-run
backend/venv/bin/python backend/manage.py backfill_speaking_reports
```

O backfill é opcional e idempotente. Recupera somente o motor já salvo das sessões anteriores, sem transcrever, avaliar novamente ou chamar o provedor. Conserva a ordenação pela atividade histórica e deixa a data exata de encerramento antigo vazia, pois ela não foi registrada separadamente. O modo `--dry-run` faz rollback das escritas. Estados incompletos são preservados e informados, sem fabricação de um plano.

Frases e dificuldades legadas ainda disponíveis no motor são mostradas como registros anteriores. Quando não há classificação estruturada, elas não recebem acertos nem entram nas contagens de respostas avaliadas. O resumo explicita essa limitação. Históricos anteriores que já tenham sido limitados pelo motor não são reconstruídos por suposição.

## Arquivos do incremento

- `backend/ai_study/speaking_reporting.py`: observações e agregação determinística.
- `models.py`, `migrations/0008_speakingsessionreport.py`: persistência por prática/cenário.
- `services.py`: eventos, snapshots, encerramento, retomada e separação de cenários.
- `permissions.py`, `serializers.py`, `views.py`, `urls.py`: consulta paginada, filtros e autorização individual/turma.
- `management/commands/backfill_speaking_reports.py`: recuperação idempotente do estado anterior.
- `src/components/SpeakingReportCard.tsx`, `SpeakingStudentProgress.tsx`: resumo progressivo e acompanhamento.
- `src/pages/AssistenteIA.tsx`, `AlunoTrilha.tsx`, `src/lib/aiStudy.ts`: integração às telas e tipos existentes.
- `backend/ai_study/test_speaking_reporting.py`, testes dos dois componentes, `AssistenteIA.oral.test.tsx`, `src/test/speakingReport.ts`: regressão e fixtures controladas.
- `scripts/check-speaking-report.mjs`: verificação visual do encerramento e acompanhamento no navegador.

## Validação

Passaram **135 testes do backend** e **83 testes do frontend**, além de build, lint dos arquivos novos/integração de Speaking e verificação de migrações. O teste de percurso percorre 12 combinações: seis níveis A1–C2 × cenário predefinido/personalizado, incluindo Aula de Jiu-Jitsu A1. Usa os endpoints reais com respostas controladas do provedor.

| Fluxo | Evidência de teste |
| --- | --- |
| A1, A2, B1, B2, C1 e C2 | Preparação obrigatória, domínio com avanço adaptativo, simulação, resumo e encerramento nos 12 percursos. |
| Ajudas | Não entendi, dica, tradução, exemplos, gramática, continuar, repetição, vocabulário e novo desafio; sem crédito indevido. |
| Retomada | Repetição da microatividade, retorno à pergunta anterior, pausa/resumo e recuperação exata da microetapa. |
| Dificuldade | Duas dificuldades com evidência, reforço, recomendações e recuperação posterior sem inventar acertos anteriores. |
| Continuidade/ramificações | Perguntas sucessivas dependentes das respostas; regressão das ramificações válidas/inválidas da Fase 3. |
| Encerramento | Fechamento natural, saída antecipada, resumo sem respostas, persistência após recarregar e conclusão idempotente. |
| Histórico | Novos desafios conservam a prática; novos cenários não misturam respostas; backfill/dry-run não chamam IA. |
| Permissões | Aluno, outro aluno, professor vinculado/não vinculado, turma, remoção de vínculo, administrador e anônimo; endpoints somente leitura. |
| Áudio e falhas | Reenvio sem duplicar relatório, rollback em contrato inválido e regressão de permissão, captura, transcrição vazia, reprodução e timeouts da Fase 4. |

Comandos principais:

```sh
DATABASE_URL='' DB_ENGINE=django.db.backends.sqlite3 DB_NAME=:memory: OPENAI_API_KEY=test DJANGO_ALLOWED_HOSTS=testserver backend/venv/bin/python backend/manage.py test ai_study --noinput
npm test -- --reporter=dot --maxWorkers=1
npm run build
DATABASE_URL='' DB_ENGINE=django.db.backends.sqlite3 DB_NAME=:memory: OPENAI_API_KEY=test backend/venv/bin/python backend/manage.py makemigrations --check --dry-run
```

Com Vite em `127.0.0.1:4173`, passaram `node scripts/check-speaking-report.mjs` (aluno/professor em 1440×1000 e 390×844) e `node scripts/check-speaking-oral.mjs` (1440×1000, 390×844 e 320×568). O primeiro valida encerramento, recarga, consulta do aluno correto, abertura das evidências/recomendações e ausência de overflow/erros de página. O segundo usa MediaRecorder real com microfone sintético e verifica gravação, pausa, upload, continuidade, reprodução e fallback de TTS. As APIs são fixtures locais. Capturas ficam em `/private/tmp/speaking-phase-5` e `/private/tmp/speaking-phase-4`.

A checagem de TypeScript conserva os dois erros preexistentes em `AppSidebar.tsx:609` e `Calendario.tsx:632`. O lint de `AlunoTrilha.tsx` conserva cinco violações anteriores de `no-explicit-any` e três avisos anteriores de dependências de hooks; a integração nessa página adiciona somente importação e renderização do componente. Não há erros novos de lint nos componentes e demais arquivos deste incremento.

Permanecem para homologação a qualidade linguística com o provedor real, dispositivos físicos/Safari/Firefox e concorrência em PostgreSQL. Os testes não substituem essas verificações nem representam avaliação acústica ou certificação automática de nível.
