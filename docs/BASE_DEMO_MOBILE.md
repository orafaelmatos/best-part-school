Base de demonstração para testes locais

A base usa o SQLite isolado do ambiente mobile e dados fictícios. Inclui um professor e cinco alunos, com trilhas geradas pelo mesmo `RegisterSerializer` e serviço de agendamento usados no cadastro normal. Os modelos vêm do catálogo existente em `backend/seed_templates.py` e das aulas comuns `ALL LEVELS` em `src/data/curriculum.ts`.

**Contas de acesso**

Senha inicial de todas as contas abaixo: `BpsDemo2026!`

| Conta | E-mail | Nível | Aulas na trilha |
| --- | --- | --- | --- |
| Professor Demo | professor@demo.bps.test | Professor | Acompanha os cinco alunos |
| Ana Demo | ana@demo.bps.test | A1/A2 | 44 |
| Bruno Demo | bruno@demo.bps.test | B1 | 24 |
| Carla Demo | carla@demo.bps.test | B2 | 24 |
| Diego Demo | diego@demo.bps.test | C1 | 24 |
| Elisa Demo | elisa@demo.bps.test | C2 | 24 |

As contas têm somente os papéis indicados; nenhuma é superusuário do Django. A senha é exclusiva dos dados fictícios de demonstração. Se você alterar uma senha localmente, executar o seed novamente não desfaz a alteração.

**Preparação e execução**

Na raiz do projeto:

```bash
npm run mobile:db:migrate
npm run mobile:seed
```

No primeiro terminal, mantenha a API aberta:

```bash
npm run dev:api:mobile
```

No segundo, execute o app do aluno no Simulator:

```bash
npm run mobile:live:ios:local
```

Use uma das contas de aluno. A conta de professor é para o painel web de gestão, que pode ser aberto em um terceiro terminal:

```bash
npm run dev:admin:local
```

Abra `http://localhost:8082/login` e entre como `professor@demo.bps.test`. O painel acessa o mesmo Django e os mesmos registros locais. Para testar o aluno no navegador, use `npm run dev:student:local` em vez do live reload; ambos usam 8081, portanto execute apenas um desses dois comandos nessa porta.

**Conteúdo disponível**

Cada aluno tem:

- Trilha completa do seu nível, incluindo as quatro aulas comuns a todos os níveis.
- Três aulas concluídas com datas passadas e as demais agendadas em encontros semanais com o professor.
- Anotações em HTML, resumos, observações, correções de erros, próximos tópicos e vocabulário apropriado ao nível.
- Nove palavras e flashcards, com exemplos e traduções, categorias, favoritos, dificuldades diferentes, revisões vencidas e futuras e histórico de revisão.
- Quatro tarefas: pendente, em andamento, enviada e corrigida. Há perguntas objetivas e abertas, respostas salvas, feedback, segunda chance e relatório.
- Material PDF, imagem de apoio e áudio reproduzível, todos servidos pelo backend local.
- Quatro conversas salvas: revisão da aula, speaking com análise, writing com correção e listening com áudio, alternativas e resultado.
- Perfil financeiro com valores fictícios, histórico de pagamentos, documento demonstrativo e estados diferentes entre os alunos.

O professor tem disponibilidade semanal e acesso às aulas, alunos, tarefas para corrigir e financeiro. O catálogo apresenta três cursos fictícios para testar a listagem.

Os áudios são vozes sintéticas locais; os feedbacks de IA são exemplos previamente preparados. Como a IA externa continua desativada nesse perfil, criar novos feedbacks ou continuar uma conversa com geração de IA exige uma etapa posterior de configuração. Consultar os exemplos, reproduzir áudio e usar a revisão de vocabulário não requer API de IA.

O exemplo de tarefa em andamento utiliza questões objetivas e segunda chance de reserva, permitindo concluir esse fluxo sem IA externa. Tarefas abertas ficam configuradas para correção manual ou já têm a correção de demonstração salva.

**Roteiro sugerido de teste**

1. Entre como Ana e confira o próximo passo, a próxima aula e o progresso.
2. Em Aulas, abra uma aula concluída e explore anotações, resumo, palavras e materiais.
3. Em Estudar, confira as tarefas, abra a corrigida e depois continue a que está em andamento.
4. Abra Meu vocabulário, revise palavras, filtre categorias/favoritos e experimente o jogo.
5. Na IA, abra o histórico e consulte uma conversa de cada modo, incluindo speaking e listening com áudio local.
6. Em Perfil, confira financeiro e catálogo.
7. Entre no painel web como professor para conferir o acompanhamento dos alunos e as tarefas enviadas.
8. Troque para Bruno, Carla, Diego ou Elisa para comparar níveis, trilhas e estados de pagamento.

**Reexecução e preservação de dados**

`npm run mobile:seed` pode ser repetido. Ele identifica suas próprias contas e modelos e preserva registros existentes, incluindo anotações, respostas, revisões, níveis e senhas que você tenha alterado. Contas locais criadas anteriormente por você continuam disponíveis.

O comando recusa outros perfis de configuração, bancos PostgreSQL e caminhos SQLite fora do diretório isolado. Não executa o script antigo de seed nem acessa a API da VPS.

As contagens da tabela assumem a base local inicial sem modelos extras criados manualmente. Se você acrescentar modelos de aula antes de criar uma nova conta demo, o cadastro normal poderá incluí-los na trilha conforme suas regras atuais.
