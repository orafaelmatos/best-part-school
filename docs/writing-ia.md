# Writing com IA

O Writing segue a sequência contextualizar, ensinar, exemplificar, praticar,
corrigir e evoluir. Depois do cenário e do nível, o aluno escolhe entre oito
formas de prática. A IA prepara uma atividade por vez, incluindo cenários
personalizados.

`backend/ai_study/writing.py` define os contratos de geração e avaliação, os
limites por CEFR e a alternância dos tipos de exercício. O servidor exige
exemplo traduzido, vocabulário e construção progressiva; em A1 são necessários
três passos de construção, e em A2, dois. Textos e diálogos são adaptados para
respostas curtas nos níveis iniciantes.

`backend/ai_study/writing_workflow.py` mantém a atividade atual e o histórico de
desempenho. As seis ajudas usam o material da própria atividade, sem fazer uma
nova chamada à IA ou trocar a tarefa. Continuar retoma a tarefa pendente;
Simular situação apresenta a mesma necessidade em uma microconversa. Depois de
uma resposta, a correção aparece junto de um único exercício seguinte. Erros
mantêm a estrutura em foco e restauram o apoio completo. Após três acertos
consecutivos, a construção pode ficar recolhida, mas o exemplo continua visível.

A avaliação considera a intenção e a correção da resposta, inclusive perguntas,
lacunas de uma palavra e alternativas diferentes do modelo. Pedidos de ajuda
por texto não contam como respostas avaliadas. Se a geração seguinte falhar,
a resposta avaliada fica salva e o aluno pode usar Continuar para tentar de novo.

Cada cenário ou troca de forma de prática gera um `WritingSessionReport`.
O relatório contém atividades respondidas, tentativas, acertos, respostas com
ajustes, estruturas, vocabulário observado, dificuldades, sugestões de revisão
e as respostas originais com suas correções. Ajudas e tarefas ainda não
respondidas não aumentam os totais.

O aluno recebe o resumo ao finalizar. O professor encontra relatórios paginados
na trilha do aluno. A API `GET /api/ai-study/writing-reports/` aceita filtros
`student` e `session` e respeita os vínculos de acesso existentes. Professores
podem consultar a prática, mas não responder nem alterar a sessão do aluno.

## Banco de dados e validação

Aplique a migração antes de disponibilizar o backend atualizado:

```sh
cd backend
python manage.py migrate
```

Os testes de IA usam respostas simuladas, sem chamadas ao provedor:

```sh
DB_ENGINE=django.db.backends.sqlite3 DB_NAME=:memory: backend/venv/bin/python backend/manage.py test ai_study --noinput
npm test
npm run build
```

Os testes cobrem cenários padrão e personalizados, A1 a C2, ajudas, continuidade,
correções, contagem de atividades, recuperação de falhas e acesso do professor.
Para conferir a qualidade pedagógica com o modelo real, use as credenciais de
IA já configuradas no backend e percorra uma sessão completa de Writing.
