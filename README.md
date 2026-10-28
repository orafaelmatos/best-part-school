# BPS Connect Hub

Projeto com frontend em Vite/React e backend em Django.

## Aplicativos Android e iOS

A base Capacitor e os builds independentes do aluno, site e gestão estão implementados. A aplicação completa continua sendo o padrão de `npm run dev` e `npm run build`.

- [Desenvolvimento mobile e comandos](docs/MOBILE_DEVELOPMENT.md)
- [Passo a passo: interface ao vivo no simulador ou iPhone](docs/TESTAR_NO_IPHONE.md)
- [API e banco locais para testar sem a VPS](docs/TESTAR_API_LOCAL.md)
- [Base demo: professor, cinco alunos, trilhas e materiais](docs/BASE_DEMO_MOBILE.md)
- [Próximas entregas e critérios de conclusão](docs/MOBILE_BACKLOG.md)
- [Plano de arquitetura](docs/PLANO_MOBILE.md)

Para iniciar o aluno no navegador, use Node 22.12+ e `npm run dev:student`. Para gerar e sincronizar com Android/iOS, configure `.env.student.local` a partir de `.env.student.example` e execute `npm run mobile:sync`.

Para testar apenas no Mac/Simulator: prepare o banco com `npm run mobile:db:migrate`, crie um aluno com `npm run mobile:create-student -- --email seu-email@example.com`, mantenha `npm run dev:api:mobile` aberto e execute `npm run mobile:live:ios:local` em outro terminal. Esse modo usa SQLite separado e ignora URLs remotas de API/mídia.

## Docker

Arquivos adicionados para deploy:

- `Dockerfile.frontend`
- `Dockerfile.backend`
- `docker-compose.yml`
- `.env.example`
- `backend/.env.example`
- `docker/frontend/default.conf`
- `docker/backend/entrypoint.sh`

## Uso local com Docker

1. Copie `.env.example` para `.env` se quiser testar variáveis do frontend fora do Docker.
2. Copie `backend/.env.example` para `backend/.env` e ajuste os valores.
3. Suba os serviços:

```bash
docker compose up --build
```

- Frontend: `http://localhost:8080`
- Backend: `http://localhost:8000`

## EasyPanel

Crie dois apps separados apontando para o mesmo repositório:

- Frontend com `Dockerfile.frontend`
- Backend com `Dockerfile.backend`

Variáveis mínimas:

- Frontend: `VITE_API_URL`, `VITE_MEDIA_BASE_URL`
- Backend: `OPENAI_API_KEY`, `DJANGO_SECRET_KEY`, `DATABASE_URL`, `DJANGO_ALLOWED_HOSTS`, `DJANGO_CORS_ALLOWED_ORIGINS`, `DJANGO_CSRF_TRUSTED_ORIGINS`

Detalhes de configuração: `DEPLOY_EASYPANEL.md`
