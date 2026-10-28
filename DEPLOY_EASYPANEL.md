# Deploy no EasyPanel

Use o mesmo repositório para criar dois serviços separados.

## Branch de produção

Configure **os dois serviços**, frontend e backend, para acompanhar exclusivamente a branch `main`. Se houver deploy automático, confirme que seu gatilho também está limitado à `main`. Pushes em `feat/*`, `fix/*` ou `chore/*` não devem publicar esses serviços.

O desenvolvimento do app fica na `feat/mobile-app`. Features web e alterações de API prontas para produção entram por pull request a partir de branches criadas de `origin/main`.

O arquivo de CI deste repositório valida código; ele não executa deploy. O deploy continua sob controle do EasyPanel. Em homologação, use serviços, banco e volumes próprios e selecione a branch que deseja testar.

Passo a passo: [fluxo de desenvolvimento e publicação](docs/FLUXO_DE_DESENVOLVIMENTO.md).

## 1. Backend

- Tipo: app com build por `Dockerfile`
- Dockerfile: `Dockerfile.backend`
- Porta interna: `8000`

Variáveis recomendadas:

```env
OPENAI_API_KEY=sua-chave
DJANGO_SECRET_KEY=gere-uma-chave-forte
DJANGO_DEBUG=False
DJANGO_ALLOWED_HOSTS=api.seu-dominio.com
DJANGO_CORS_ALLOWED_ORIGINS=https://app.seu-dominio.com
DJANGO_CSRF_TRUSTED_ORIGINS=https://app.seu-dominio.com
DATABASE_URL=postgresql://usuario:senha@host:5432/bps
DJANGO_MIGRATE_ON_START=1
DJANGO_COLLECTSTATIC_ON_START=1
GUNICORN_WORKERS=3
GUNICORN_TIMEOUT=120
```

Volume persistente recomendado:

- Mount path: `/app/backend/media`

Se o banco for criado dentro do próprio EasyPanel, use a `DATABASE_URL` fornecida por ele.

## 2. Frontend

- Tipo: app com build por `Dockerfile`
- Dockerfile: `Dockerfile.frontend`
- Porta interna: `80`

Variáveis:

```env
VITE_API_URL=https://api.seu-dominio.com/api/
VITE_MEDIA_BASE_URL=https://api.seu-dominio.com
```

Essas variáveis são injetadas em runtime pelo Nginx. Isso permite reaproveitar a mesma imagem sem rebuild para trocar domínio.

## 3. Ordem sugerida

1. Suba o banco.
2. Suba o backend e confirme que `https://api.seu-dominio.com/api/` responde.
3. Suba o frontend apontando `VITE_API_URL` para a URL pública do backend.

## 4. Observações

- O backend executa `migrate` e `collectstatic` ao iniciar por padrão.
- O frontend é SPA e o Nginx já está configurado com fallback para `index.html`.
- Arquivos de mídia continuam sendo servidos pelo backend; por isso o volume em `/app/backend/media` é importante.
