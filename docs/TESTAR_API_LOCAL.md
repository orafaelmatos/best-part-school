# API local para testar o aplicativo

Este ambiente usa o Django no Mac e um SQLite separado em `backend/.local-mobile/db.sqlite3`. Não conecta ao banco da VPS e não copia alunos de produção. Os arquivos enviados ficam em `backend/.local-mobile/media/`. Esses dados são ignorados pelo Git.

O perfil é `bps_core.settings_mobile`. Ele substitui a configuração de banco, mídia e serviços externos, mesmo que `backend/.env` aponte para produção. Não é necessário editar esse arquivo. A IA fica desabilitada neste perfil: o cliente aponta para uma porta local sem serviço e não usa a chave existente. Login, navegação e dados locais podem ser desenvolvidos sem chamar a VPS.

Para começar com dados completos, execute `npm run mobile:seed` depois das migrações. A [base demo](./BASE_DEMO_MOBILE.md) inclui professor, cinco alunos de níveis diferentes, trilhas, anotações, vocabulário, tarefas e materiais. A criação manual abaixo continua disponível para contas adicionais.

## Preparar o backend uma vez

Execute na raiz do projeto:

```bash
npm run mobile:db:migrate
npm run mobile:create-student -- --email seu-email-de-teste@example.com --name "Aluno local"
```

Escolha e confirme uma senha quando o terminal pedir. Os caracteres não aparecem. O comando cria uma conta com papel de aluno, sem acesso administrativo, e não altera uma conta que já existir. Use esse e-mail e essa senha no aplicativo. A conta da escola na VPS não existe automaticamente neste banco.

O ambiente virtual `backend/venv` já está disponível neste projeto. Se recriar o ambiente no futuro, instale `backend/requirements.txt` nele antes dos comandos. Use seu próprio e-mail de teste no lugar do exemplo.

## Executar durante o desenvolvimento

Deixe o backend aberto em um terminal:

```bash
npm run dev:api:mobile
```

O servidor recebe conexões apenas do próprio Mac. Em outro terminal, inicie o live reload com API local:

```bash
npm run mobile:live:ios:local
```

O Vite encaminha `/api/` e `/media/` para o backend local. A porta 8081 permite manter outro frontend aberto na 8080. O modo local ignora os endereços remotos de API configurados para o app. Mantenha os dois terminais abertos enquanto testa no Simulator.

Para testar em um iPhone físico, permita explicitamente o IP privado do Mac no backend, mantendo a escuta em `127.0.0.1`:

```bash
BPS_MOBILE_ALLOWED_HOSTS=192.168.1.20 backend/venv/bin/python backend/manage.py runserver 127.0.0.1:8000 --settings=bps_core.settings_mobile
npm run mobile:live:ios:local -- --host 192.168.1.20
```

Substitua `192.168.1.20` pelo IP real do Mac e siga o pareamento e assinatura descritos em [TESTAR_NO_IPHONE.md](TESTAR_NO_IPHONE.md). O IP é permitido para o cabeçalho Host encaminhado pelo Vite; o Django continua restrito ao Mac. Não é necessário liberar todas as origens nem expor a porta 8000 na rede.

Se a porta 8000 já estiver ocupada, escolha outra nas duas pontas:

```bash
backend/venv/bin/python backend/manage.py runserver 127.0.0.1:8001 --settings=bps_core.settings_mobile
npm run mobile:live:ios -- --local-api --api-port 8001 --port 8081
```

## Confirmar o ambiente e diagnosticar login

Abra `http://127.0.0.1:8000/api/local/health/`. A resposta deve ser:

```json
{"mode":"mobile-local","database":"sqlite-local"}
```

O comando de live reload verifica essa identificação antes de abrir o Xcode. Se a API local não estiver aberta, ele informa como iniciá-la. Para testar no navegador com o mesmo proxy local, use `npm run dev:student:local` e abra `http://localhost:8081`.

- Sem conexão: mantenha o servidor Django aberto e use a mesma porta no live reload.
- Credenciais inválidas: crie o aluno neste SQLite e use a senha escolhida no terminal.
- Tela sem aulas: o banco começa vazio. Esta preparação cria somente a conta de login; aulas e materiais de demonstração serão adicionados no desenvolvimento.
- IA indisponível: este perfil bloqueia o uso de serviços externos deliberadamente.
- Host inválido no iPhone: reinicie o Django com `BPS_MOBILE_ALLOWED_HOSTS` contendo o IP atual do Mac.

Para verificar o comando e o login com um banco de teste SQLite temporário:

```bash
backend/venv/bin/python backend/manage.py test accounts.test_mobile_student --settings=bps_core.settings_mobile
```

Use sempre `--settings=bps_core.settings_mobile` nos comandos locais acima. O comando de criação recusa execução nos outros perfis antes de consultar usuários.
