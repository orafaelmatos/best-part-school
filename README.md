# BPS Connect Hub

Projeto com frontend em Vite/React e backend em Django.

## Desenvolvimento e produção

A `main` é a base de produção. O app em desenvolvimento fica na `feat/mobile-app`; novas features para produção partem de `origin/main` em pastas de trabalho separadas.

```bash
bash scripts/new-feature.sh feat/nome-da-feature
```

Veja o [fluxo de desenvolvimento e publicação](docs/FLUXO_DE_DESENVOLVIMENTO.md), incluindo pull requests, validações e configuração do EasyPanel.

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
