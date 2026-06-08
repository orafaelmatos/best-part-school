# Deploy no EasyPanel

Use o mesmo repositório para criar dois serviços separados.

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
