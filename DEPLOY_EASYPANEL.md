# Deploy no EasyPanel

Use o mesmo repositório para criar dois serviços separados.

## Branch de produção

Configure **os dois serviços**, frontend e backend, para acompanhar exclusivamente a branch `main`. Se houver deploy automático, confirme que seu gatilho também está limitado à `main`. Pushes em `feat/*`, `fix/*` ou `chore/*` não devem publicar esses serviços.

O desenvolvimento do app fica na `feat/mobile-app`. Features web e alterações de API prontas para produção entram por pull request a partir de branches criadas de `origin/main`.

O arquivo de CI deste repositório valida código; ele não executa deploy. O deploy continua sob controle do EasyPanel. Em homologação, use serviços, banco e volumes próprios e selecione a branch que deseja testar.

Passo a passo: [fluxo de desenvolvimento e publicação](docs/FLUXO_DE_DESENVOLVIMENTO.md). Para a versão mobile, siga também [publicação nas lojas](docs/PUBLICAR_APP.md), incluindo migrações, conta de revisão e validação em aparelhos.

## 1. Backend

- Tipo: app com build por `Dockerfile`
- Dockerfile: `Dockerfile.backend`
- Porta interna: `8000`

Variáveis recomendadas:

```env
OPENAI_API_KEY=sua-chave
DJANGO_SETTINGS_MODULE=bps_core.settings_production
DJANGO_SECRET_KEY=SUBSTITUA_POR_UMA_CHAVE_GERADA
DJANGO_DEBUG=False
DJANGO_ALLOWED_HOSTS=api.seu-dominio.com
DJANGO_CORS_ALLOWED_ORIGINS=https://bestpartschool.com,capacitor://localhost,https://localhost
DJANGO_CSRF_TRUSTED_ORIGINS=https://api.seu-dominio.com,https://bestpartschool.com
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

Privacidade, suporte e exclusão também são exportados em HTML estático. Os valores públicos `VITE_SUPPORT_EMAIL`, `VITE_ORGANIZATION_NAME`, `VITE_ORGANIZATION_ID` e `VITE_PUBLIC_SITE_URL` são argumentos de **build** do `Dockerfile.frontend`: configure-os nos build arguments do EasyPanel e reconstrua a imagem ao trocar o contato ou responsável. O padrão atual usa o contato temporário aprovado; confira os dados antes da publicação. Arquivos `.env` locais são excluídos do contexto Docker.

## 3. Ordem sugerida

1. Suba o banco.
2. Suba o backend e confirme que `https://api.seu-dominio.com/api/` responde.
3. Suba o frontend apontando `VITE_API_URL` para a URL pública do backend.

## 4. Observações

- O backend executa `migrate` e `collectstatic` ao iniciar por padrão.
- O frontend tem fallback para `index.html` e páginas públicas estáticas em `/privacidade/`, `/suporte/` e `/excluir-conta/`.
- Arquivos de mídia são servidos pelo Django com links assinados e temporários; preserve o volume `/app/backend/media` e não crie uma rota estática pública que ignore essa proteção.
