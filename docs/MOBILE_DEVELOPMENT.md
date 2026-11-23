Desenvolvimento mobile

O projeto mantém builds independentes para aluno, site e gestão. O escopo da primeira versão mobile atende alunos já matriculados, sem compras nem cobranças. Para configuração de produção e publicação, siga [PUBLICAR_APP.md](./PUBLICAR_APP.md); resultados e limites dos testes estão em [RELEASE_VALIDATION.md](./RELEASE_VALIDATION.md).

Para acompanhar as alterações de interface ao salvar no Simulator ou iPhone, siga [TESTAR_NO_IPHONE.md](./TESTAR_NO_IPHONE.md). O comando `npm run mobile:live:ios` prepara uma cópia nativa de desenvolvimento isolada do projeto usado para distribuição.

Para desenvolver sem VPS nem API HTTPS externa, use `npm run mobile:live:ios:local`, o perfil Django `settings_mobile` e o SQLite isolado. O passo a passo está em [TESTAR_API_LOCAL.md](./TESTAR_API_LOCAL.md). O proxy é habilitado somente no servidor de desenvolvimento; as exigências HTTPS abaixo continuam aplicáveis aos builds empacotados.

**Organização atual**

```text
src/apps/
  legacy/App.tsx          aplicação atual completa
  site/App.tsx            páginas institucionais
  admin/App.tsx           gestão de professores e administradores
  student/App.tsx         app do aluno com HashRouter e ciclo nativo
  shared/                rotas e redirecionamentos compartilhados
  AppProviders.tsx        QueryClient e providers de interface
src/lib/
  api.ts                 cliente HTTP, renovação coordenada e repetição de 401
  session.ts             sessão em memória e controle de concorrência
  session-storage.ts     navegador ou armazenamento seguro nativo
  recordingAudio.ts      formatos de gravação e extensão de upload
  buildConfig.ts         validação de configuração pública do app
android/                 projeto Android Studio
ios/                     projeto Xcode com Swift Package Manager
capacitor.config.ts      identificador, nome e diretório do pacote do aluno
```

A separação usa um alias do Vite resolvido durante o build. As outras entradas não são importadas pelo pacote escolhido. O build verifica módulos incluídos para impedir que páginas exclusivas de outra aplicação entrem por engano. Componentes existentes que servem a mais de um perfil ainda são compartilhados; controles de acesso na API continuam necessários.

Não movemos todo o projeto para workspaces neste primeiro passo: isso aumentaria o impacto sem ser necessário para gerar os aplicativos. A extração futura de pacotes pode ser progressiva. npm e package-lock.json são usados nos comandos desta implementação.

**Pré-requisitos e instalação**

- Node.js 22.12 ou superior e npm.
- Para compilar iOS: macOS com Xcode completo compatível com Capacitor 8 e ferramentas selecionadas via xcode-select.
- Para compilar Android: Android Studio, SDK e JDK compatíveis com a versão do Gradle gerada.
- API e mídia acessíveis por HTTPS no aparelho.

```bash
npm ci
cp .env.student.example .env.student.local
```

Substituir os endereços de exemplo no arquivo local pelos da homologação. Variáveis VITE são públicas no pacote; não incluir senhas, chave OpenAI ou credenciais de serviços.

```dotenv
VITE_API_URL=https://api.seu-dominio.com/api/
VITE_MEDIA_BASE_URL=https://api.seu-dominio.com
VITE_PUBLIC_SITE_URL=https://bestpartschool.com
```

O build do aluno recusa API ausente, URL relativa, HTTP, localhost, credenciais, query e fragmento. A mesma validação ocorre quando a interface inicia no ambiente nativo. Não há fallback para o servidor local do WebView. Em desenvolvimento no navegador, o fallback web antigo continua disponível.

**Comandos**

| Objetivo | Comando | Saída |
| --- | --- | --- |
| Desenvolver aplicação atual | `npm run dev` | Vite, entrada completa |
| Desenvolver aluno no navegador | `npm run dev:student` | Entrada do aluno, rotas com `#` |
| Desenvolver site | `npm run dev:site` | Páginas públicas |
| Desenvolver gestão | `npm run dev:admin` | Painel de professores/admin |
| Build atual | `npm run build` | `dist/` |
| Build institucional | `npm run build:site` | `dist/site/` |
| Build da gestão | `npm run build:admin` | `dist/admin/` |
| Build do aluno | `npm run build:student` | `dist/student/` |
| Build do aluno + sincronização nativa | `npm run mobile:sync` | Assets/plugins em Android e iOS |
| Abrir Android Studio | `npm run mobile:android` | Projeto Android |
| Abrir Xcode | `npm run mobile:ios` | Projeto iOS |
| Diagnóstico Capacitor | `npm run mobile:doctor` | Informações do ambiente |
| Verificar tipos | `npm run check:types` | Frontend e configuração |
| Testes frontend | `npm test` | Vitest |

Os servidores usam porta 8080 por padrão; usar `-- --port 8081` para executar outro em paralelo. Existem também comandos `preview:student`, `preview:site` e `preview:admin` para conferir o build correspondente.

O build legado limpa `dist/` inteiro. Se gerar os quatro destinos no mesmo diretório de trabalho, executar o legado primeiro e os destinos separados depois. Cada deploy deve copiar somente a saída correspondente. O Dockerfile.frontend mantém o deploy legado como padrão e foi atualizado para Node 22.

Para um teste no aparelho:

```bash
npm run mobile:sync
npm run mobile:android
# ou:
npm run mobile:ios
```

Compilar e executar no aparelho pelas ferramentas nativas. O repositório contém os projetos; não há necessidade de executar `cap add` novamente. Reexecutar `mobile:sync` depois de alterar código, configuração ou plugins. Assets web copiados e arquivos de SDK/assinatura locais são ignorados pelo Git.

O identificador é `com.bestpartschool.student`. Confirmar esse nome antes de cadastrar o aplicativo nas lojas; uma troca requer atualizar também os projetos nativos. Ícones e telas de abertura usam o logo existente da escola. Versões são alinhadas por `npm run mobile:version -- 1.0.0 2`; `npm run mobile:prepare` valida e sincroniza o pacote sem assinar ou publicar.

**Backend para o primeiro teste**

O app usa a API sob `/api/`. Esta versão inclui migrações para consentimento e denúncias de IA e exige o backend atualizado antes da distribuição. Produção usa `bps_core.settings_production`, PostgreSQL e mídia privada. `settings_mobile` é exclusivo para desenvolvimento isolado.

Na homologação, configurar explicitamente as origens existentes e as origens do WebView:

```dotenv
DJANGO_CORS_ALLOWED_ORIGINS=https://seu-painel.com,capacitor://localhost,https://localhost
```

O perfil de produção inclui as origens nativas além das origens web configuradas. CORS não substitui autenticação e autorização. Manter a configuração de CSRF específica dos clientes web que usam cookies; o aplicativo usa Bearer JWT.

Testes de formato de áudio sem banco:

```bash
cd backend
python manage.py test ai_study.test_audio_formats bps_core.tests --verbosity 1
```

Usar o ambiente Python do projeto com as dependências instaladas.

**Comportamento implementado**

- A aplicação atual continua como entrada padrão.
- Site isolado contém páginas públicas; CTA de aluno usa `VITE_STUDENT_APP_URL`, ou contato quando não configurado. Privacidade, suporte e exclusão são exportados em HTML estático; as demais telas usam a SPA.
- Aluno entra pelo login/painel. Professores/admin não montam telas do aluno, e alunos não montam telas de gestão na entrada admin. A API também valida os papéis, vínculos e campos por operação.
- Contas e dados existentes continuam no mesmo backend. Login utiliza access e refresh; renovação é coordenada para evitar múltiplas chamadas simultâneas e não restaurar uma conta após logout.
- Sessão nativa usa o plugin seguro com Keychain local do aparelho e armazenamento Android protegido pelo Keystore. O comportamento no navegador preserva as sessões existentes em localStorage.
- Áudio seleciona MIME suportado e preserva extensão e tipo enviados ao backend. Gravação limpa microfone e temporizador ao cancelar/desmontar.
- Android volta pelo histórico interno e minimiza na raiz. Ao retomar o app, consultas podem atualizar pelo TanStack Query. Listeners nativos são removidos ao desmontar.
- Manifestos têm permissão de microfone e texto de finalidade no iOS. Backup do app Android foi desabilitado nesta base.

**Verificação realizada e limites**

Os testes cobrem rotas, papéis e vínculos na API, campos sensíveis, mídia privada, consentimento, exclusão, renovação e concorrência de sessão, armazenamento, gravação e ciclo nativo simulado. A compilação Release sem assinatura passou no Xcode e no Gradle com SDK 36; isso não gera uma distribuição aprovada pelas lojas. Consulte os resultados atuais em [RELEASE_VALIDATION.md](./RELEASE_VALIDATION.md).

A verificação de interface usa `playwright.mobile.config.ts`, pelo comando `npm run test:mobile`. No CI, instale o Chromium via Playwright; no Mac, o Chrome instalado pode ser usado. Os testes verificam navegação em 360, 390 e 430 pixels e desktop com dados fictícios. Não substituem login, gravação, interrupções, reprodução e armazenamento em aparelhos físicos com a API real. Os materiais para cadastro nas lojas estão em `docs/store-assets/`.

Referências de implementação: [Capacitor](https://capacitorjs.com/docs/getting-started), [configuração](https://capacitorjs.com/docs/config), [ambiente](https://capacitorjs.com/docs/getting-started/environment-setup), [armazenamento seguro](https://github.com/aparajita/capacitor-secure-storage).
