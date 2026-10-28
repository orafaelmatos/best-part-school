Desenvolvimento mobile — primeira base implementada

Esta etapa mantém a aplicação atual funcionando e cria builds independentes para o aluno, o site e a gestão. Não é uma versão pronta para publicar nas lojas. A sequência de trabalho restante está em [MOBILE_BACKLOG.md](./MOBILE_BACKLOG.md).

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

O identificador inicial é `com.bestpartschool.student`. Confirmar esse nome antes de cadastrar o aplicativo nas lojas; uma troca requer atualizar também os projetos nativos. Ícones e telas de abertura ainda são os padrões gerados pelo Capacitor.

**Backend para o primeiro teste**

O app usa os endpoints atuais. Não há migração de banco nesta etapa. A atualização do backend é necessária para aceitar áudio MP4.

Na homologação, configurar explicitamente as origens existentes e as origens do WebView:

```dotenv
DJANGO_CORS_ALLOWED_ORIGINS=https://seu-painel.com,capacitor://localhost,https://localhost
```

Os padrões locais incluem essas origens. Em ambientes que já definem a variável, os padrões não substituem a configuração existente. CORS não substitui autenticação e autorização. Manter a configuração de CSRF específica dos clientes web que usam cookies; o aplicativo usa Bearer JWT.

Testes de formato de áudio sem banco:

```bash
cd backend
python manage.py test ai_study.test_audio_formats bps_core.tests --verbosity 1
```

Usar o ambiente Python do projeto com as dependências instaladas.

**Comportamento implementado**

- A aplicação atual continua como entrada padrão.
- Site isolado contém apenas páginas públicas; CTA de aluno usa `VITE_STUDENT_APP_URL`, ou contato quando não configurado. Ainda é uma SPA: pré-renderização e SEO são uma etapa posterior.
- Aluno entra pelo login/painel. Professores/admin não montam telas do aluno, e alunos não montam telas de gestão na entrada admin. Isso é um controle da interface, não uma correção das permissões do servidor.
- Contas e dados existentes continuam no mesmo backend. Login utiliza access e refresh; renovação é coordenada para evitar múltiplas chamadas simultâneas e não restaurar uma conta após logout.
- Sessão nativa usa o plugin seguro com Keychain local do aparelho e armazenamento Android protegido pelo Keystore. O comportamento no navegador preserva as sessões existentes em localStorage.
- Áudio seleciona MIME suportado e preserva extensão e tipo enviados ao backend. Gravação limpa microfone e temporizador ao cancelar/desmontar.
- Android volta pelo histórico interno e minimiza na raiz. Ao retomar o app, consultas podem atualizar pelo TanStack Query. Listeners nativos são removidos ao desmontar.
- Manifestos têm permissão de microfone e texto de finalidade no iOS. Backup do app Android foi desabilitado nesta base.

**Verificação realizada e limites**

Os testes automatizados cobrem rotas isoladas, perfis, renovação e concorrência de sessão, armazenamento, gravação e ciclo nativo simulado. Os builds dos quatro destinos e a sincronização Capacitor foram verificados. Para conferir o build do aluno sem API real, a execução de validação usou um domínio reservado `api.example.test`, que não atende requisições. Esse build deve ser regenerado com a API real antes de testar login.

Resultado da base e da primeira interface mobile: 104 testes frontend aprovados, além dos 4 testes Django da base. Os testes de navegador verificam os fluxos do aluno em 360, 390 e 430 pixels e desktop. A checagem de separação de páginas passou nos builds de site, gestão e aluno.

O ambiente desta implementação não tem Xcode completo, JDK ou Android SDK prontos. Não foi compilado APK/AAB/IPA e não houve teste em aparelho. Testes com plugins simulados não comprovam armazenamento, gravação, interrupções ou reprodução no sistema operacional.

A configuração Playwright antiga referencia um pacote ausente. A verificação mobile usa a configuração independente `playwright.mobile.config.ts`, pelo comando `npm run test:mobile`, e o Chrome instalado no Mac. Os testes usam dados simulados apenas no ambiente de testes; não substituem login e gravação com a API real nem testes físicos. As capturas de interface ficam em `docs/screenshots/`.

Referências de implementação: [Capacitor](https://capacitorjs.com/docs/getting-started), [configuração](https://capacitorjs.com/docs/config), [ambiente](https://capacitorjs.com/docs/getting-started/environment-setup), [armazenamento seguro](https://github.com/aparajita/capacitor-secure-storage).
