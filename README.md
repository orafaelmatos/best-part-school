# BPS Connect Hub

Projeto com frontend em Vite/React e backend em Django.

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

## Revisão guiada de aulas

O modo **Revisar Aula** oferece dez atividades, mantém o campo de mensagem e salva
o progresso de cada resposta. O aluno avança depois da correção; três acertos
seguidos aumentam a dificuldade e um erro reduz a dificuldade e orienta o reforço.

As atividades usam anotações, resumos, vocabulário, flashcards, imagens anexadas e
perguntas/correções de homework da aula selecionada. Respostas e flashcards pessoais
são filtrados pelo aluno. Títulos e assuntos planejados para aulas futuras não
servem como evidência. Aulas sem material utilizável solicitam o registro do
conteúdo ao professor. PDFs e links externos não são extraídos automaticamente.

**Finalizar revisão** grava acertos, erros, tempo de prática, dificuldades e
respostas com correções. O relatório fica na conversa e na trilha do aluno, no
painel do professor. Ao trocar de aula depois de começar a prática, o relatório
atual é salvo e uma nova revisão é aberta. Excluir a conversa preserva o relatório.
O tempo usa atividade em primeiro plano e intervalos limitados a 60 segundos,
sem contabilizar toda a ausência entre visitas.

Para disponibilizar a alteração, aplique a migração antes de iniciar o backend:

```bash
cd backend
python manage.py migrate
```

A revisão usa a chave `OPENAI_API_KEY` existente. Listening utiliza TTS; speaking
envia o áudio real em WAV ao modelo definido por `OPENAI_REVIEW_AUDIO_MODEL`
(padrão `gpt-audio-1.5`) e usa a transcrição para corrigir a resposta. A conta
precisa ter acesso a esse modelo. O microfone requer HTTPS ou localhost e aceita
gravações de até dois minutos. Referência: [entrada de áudio na API](https://developers.openai.com/api/docs/guides/audio-chat-completions).

Os testes da revisão simulam a IA e não precisam de chamadas pagas:

```bash
npm test -- src/pages/AssistenteIA.test.tsx
cd backend
DATABASE_URL='' DB_ENGINE=django.db.backends.sqlite3 DB_NAME=:memory: OPENAI_API_KEY=test-key python manage.py test ai_study --noinput
```
