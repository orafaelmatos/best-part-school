# Validação da versão mobile 1.0.0 (build 1)

Verificação em 23/11/2026, na `feat/mobile-app`. A `main` (`dd484f5`, também confirmada no remoto) foi integrada à feature em `5fda01b`. A branch `main` não foi alterada e nenhum deploy ou envio às lojas foi executado.

O código está preparado para revisão e merge. A distribuição depende do deploy desta API, da validação em aparelhos e da assinatura com as contas do responsável. O fluxo inicial aprovado não inclui compras ou cobranças mobile.

## Evidências automatizadas

| Verificação | Resultado |
| --- | --- |
| `npm run mobile:prepare` | Configuração real HTTPS, versões, lint, tipos, testes, build do aluno e sincronização Capacitor aprovados |
| Frontend Vitest | 239 testes aprovados em 40 arquivos |
| Scripts de desenvolvimento e verificação da API | 14 testes aprovados |
| Playwright mobile | 6 cenários aprovados, com dados fictícios; 4 exportadores de imagens ignorados na execução comum |
| Exportação dos materiais das lojas | 4 exportadores aprovados junto aos 6 cenários da interface: 10 verificações aprovadas, produzindo capturas para iPhone, iPad e Android e imagem de destaque Google Play |
| Builds legado, site, gestão e aluno | Aprovados, incluindo os limites de módulos por aplicação |
| Django com PostgreSQL temporário UTF-8 | `Ran 387 tests`, `OK (skipped=7)`; os casos locais exclusivos de SQLite são ignorados nesse perfil |
| Demonstração local e conta de revisão, SQLite isolado | 14 testes aprovados |
| CORS e endpoints no perfil de produção local | Duas origens nativas aprovadas; consentimento, exclusão e denúncias exigem autenticação e respondem JSON |
| Migrações pendentes | `makemigrations --check --dry-run`: nenhuma alteração sem migração |
| Configuração de deploy Django | Sem erros; aviso `security.W021` por não aderir à lista HSTS preload |
| Compatibilidade Python | `pip check`: nenhuma dependência incompatível |
| Android Release | `:app:bundleRelease :app:lintRelease` aprovados, SDK 36 e JDK 21; AAB sem assinatura confirmado por `jarsigner` |
| iOS Release | `xcodebuild` aprovado para dispositivo iOS genérico com `CODE_SIGNING_ALLOWED=NO`, usando Xcode 27.2 |
| Integridade do diff | `git diff --check` aprovado |

Os testes não usam contas nem banco de produção. Os fluxos de IA são simulados nos testes e não comprovam qualidade do serviço externo ou permissões reais do aparelho. A compilação iOS não constitui teste de execução no Simulator; o serviço CoreSimulator local indicou versão desatualizada.

## Dependências e avisos restantes

As correções do backend incluem Django 6.0.10, Django REST Framework 3.18.3, Pillow 13.0.0, PyJWT 2.15.1 e dependências de rede/SQL. A auditoria `pip-audit` 2.10.1 das versões fixadas não encontrou vulnerabilidades conhecidas após a atualização. Referências das correções: [Django](https://www.djangoproject.com/weblog/2026/nov/03/security-releases/), [REST Framework](https://www.django-rest-framework.org/community/release-notes/), [Pillow](https://pillow.readthedocs.io/en/stable/releasenotes/13.0.0.html).

A auditoria npm completa reportou **0 críticas, 0 altas, 0 moderadas e 2 baixas**, correspondentes ao mesmo problema upstream de exportação semântica do Quill e seu wrapper. Essa exportação está desativada em todos os editores (`useSemanticHTML=false`); o HTML de exibição usa a sanitização por allowlist, com testes de conteúdo malicioso. O app do aluno não inclui as páginas de edição da gestão. A correção upstream continua devendo ser acompanhada.

ESLint termina com **0 erros e 22 avisos**, concentrados em Fast Refresh e dependências de hooks existentes. Vite avisa sobre tamanho de chunks; Gradle lint mantém avisos de recursos e versões recomendadas, sem erros. Esses avisos não foram ocultados por uma desativação geral das regras.

## API publicada: etapa obrigatória após o merge/deploy

As verificações públicas, sem autenticação, confirmaram:

- `/admin/login/`: HTTP 200 com o login do Django.
- `/api/accounts/login/` com GET: HTTP 405 JSON, indicando o endpoint correto sob `/api/`.
- `/api/accounts/ai-consent/` e `/api/accounts/me/delete/`: HTTP 404 na versão atualmente publicada.
- Preflight de login para `capacitor://localhost` e `https://localhost`: sem os cabeçalhos CORS exigidos pelo app.

Portanto, **o backend atualmente no ar precisa ser atualizado antes da distribuição**. `npm run mobile:check:api` detectou esse bloqueio como esperado. Depois de publicar o código e as variáveis descritas em [PUBLICAR_APP.md](./PUBLICAR_APP.md), execute o comando novamente até passar. Os comandos de release assinado também fazem essa verificação.

Essa checagem não autentica ninguém nem substitui testes de login, gravação, arquivos e exclusão com contas fictícias. Não foi alterado o EasyPanel, Cloudflare ou qualquer dado de produção.

## Antes de enviar

Siga o [guia completo de publicação](./PUBLICAR_APP.md) e as [declarações das lojas](./DECLARACOES_LOJAS.md). Confirme o contato temporário, publique backend e páginas públicas, execute a checagem da API, teste em aparelhos reais, crie a conta de revisão e gere os pacotes assinados. Os [materiais de cadastro](./store-assets/README.md) usam dados fictícios e foram inspecionados visualmente.
