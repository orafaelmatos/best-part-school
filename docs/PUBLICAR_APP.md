# Publicar Best Part School no Android e iOS

Versão inicial: **1.0.0**, build **1**. Identificador nas duas plataformas: `com.bestpartschool.student`.

O app mobile desta versão atende alunos já matriculados. Compras, PIX, financeiro e catálogo comercial ficam fora do pacote e das rotas mobile. O portal web mantém suas áreas de gestão e financeiro. O catálogo web usa contato com a escola em vez de botões de compra sem ação.

## Levar a feature para a main

1. Revise as alterações da `feat/mobile-app` e o [registro de validação](./RELEASE_VALIDATION.md). A `main` atual foi integrada à feature, mas não recebeu as alterações mobile.
2. Envie a branch com `git push -u origin feat/mobile-app` e abra um pull request para `main`. Aguarde os checks do CI.
3. Antes de fazer o merge, prepare no EasyPanel as variáveis e os backups descritos abaixo. Para testar antes do merge, use serviços de homologação com banco, mídia e domínio próprios e a branch da feature; nunca aponte os comandos de demonstração local para produção.
4. Faça o merge quando a revisão e a validação de homologação estiverem concluídas. Se o EasyPanel acompanha automaticamente a `main`, isso dispara o deploy web/backend. O app das lojas continua exigindo build, assinatura e envio próprios.
5. Confirme o deploy, execute a checagem da API e siga os passos Android/iOS deste guia. A aprovação do código não substitui os testes em aparelhos nem a revisão das lojas.

## Configuração pública do app

Use Node 22.12+ e instale as dependências com `npm ci`. Ajuste `.env.student.local` seguindo `.env.student.production.example`:

```dotenv
VITE_API_URL=https://api.bestpartschool.com/api/
VITE_MEDIA_BASE_URL=https://api.bestpartschool.com
VITE_PUBLIC_SITE_URL=https://bestpartschool.com
VITE_SUPPORT_EMAIL=gabriel@bestpartschol.com
VITE_ORGANIZATION_NAME=Best Part School
VITE_ORGANIZATION_ID=
```

O endereço de suporte acima é **provisório**, informado pelo responsável pelo projeto, com `bestpartschol.com` escrito dessa forma. Troque-o pelo contato definitivo antes da publicação pública se ele ainda não estiver operacional. Nome jurídico/CNPJ podem ser informados em `VITE_ORGANIZATION_NAME` e `VITE_ORGANIZATION_ID`, quando aplicável. Variáveis `VITE_*` são públicas; nunca inclua chaves de IA, senhas ou certificados.

Remova `VITE_LOCAL_API=1`, `BPS_MOBILE_DEV=1` e `BPS_LIVE_RELOAD_URL` do ambiente de release. O app de distribuição carrega seus arquivos locais e se conecta à API por HTTPS.

```bash
npm run mobile:check
npm run mobile:prepare
npm run test:mobile
```

`mobile:prepare` verifica configuração, versões, lint, tipos e testes; gera o pacote do aluno e sincroniza Android/iOS. Ele não assina nem publica. Para trocar a versão e o número de envio em todos os projetos:

```bash
npm run mobile:version -- 1.0.0 2
```

O número de build/versionCode deve crescer em cada novo envio. Não reutilize o build 1 se ele já foi enviado.

## Publicar o backend e o site antes dos binários

A API precisa conter as novas migrações e endpoints de consentimento, denúncias e exclusão antes de receber o app. Não configure produção com `settings_mobile`, SQLite ou os comandos de demonstração local.

No EasyPanel, frontend e backend devem acompanhar a `main`. Antes do merge, faça backup do PostgreSQL e do volume de mídia e confira estas configurações do backend:

```dotenv
DJANGO_SETTINGS_MODULE=bps_core.settings_production
DJANGO_DEBUG=False
DJANGO_ALLOWED_HOSTS=api.bestpartschool.com
DJANGO_CORS_ALLOWED_ORIGINS=https://bestpartschool.com,capacitor://localhost,https://localhost
DJANGO_CSRF_TRUSTED_ORIGINS=https://api.bestpartschool.com,https://bestpartschool.com
DJANGO_SECURE_SSL_REDIRECT=True
PRIVATE_MEDIA_URL_TTL=900
```

Configure também `DATABASE_URL`, `DJANGO_SECRET_KEY` aleatória com pelo menos 50 caracteres e `OPENAI_API_KEY` nas variáveis secretas do serviço. O proxy precisa encaminhar `X-Forwarded-Proto: https`, como esperado pelo Django. O backend de produção força `DEBUG=False`, cookies seguros, HTTPS e PostgreSQL; inclui as origens nativas no CORS mesmo quando já há origens web configuradas.

Você pode gerar a chave Django no seu terminal com `python -c 'import secrets; print(secrets.token_urlsafe(64))'`. Cadastre o resultado no gerenciador de segredos do serviço; não salve no Git. O texto de exemplo do arquivo de configuração precisa ser substituído e é recusado pelo perfil de produção.

Os tokens de acesso duram 15 minutos e o app renova a sessão. A verificação de revogação por troca de senha também foi ativada; sessões emitidas antes dessa atualização podem precisar de novo login.

O entrypoint Docker executa migrações e `collectstatic`, salvo se essas etapas forem explicitamente desabilitadas. Confira os logs de ambas. Em um terminal do serviço backend, as verificações são:

```bash
python manage.py migrate --noinput
python manage.py check --deploy
python manage.py makemigrations --check --dry-run
```

HSTS está ativo; a adesão à lista de preload dos navegadores permanece desativada deliberadamente. O aviso Django `security.W021` corresponde a essa escolha e não desativa HTTPS.

**Não exponha o volume de mídia por um servidor estático, bucket público ou regra independente do Django.** `/media/` agora exige um link assinado de curta duração, emitido apenas pelos fluxos autorizados. Áudio aceita requisições HTTP Range. Fotos e arquivos existentes continuam no mesmo volume. Mantenha-o persistente e não o substitua durante o deploy.

A exclusão remove registros e arquivos sem outras referências após o commit. Para auditar resíduos antigos de uploads interrompidos, o comando abaixo apenas simula:

```bash
python manage.py purge_orphan_media
```

Revise o resultado e o backup antes de executar `python manage.py purge_orphan_media --delete`. O padrão preserva arquivos dos últimos sete dias e materiais ainda referenciados.

O build web exporta estas páginas como HTML estático, sem exigir login ou JavaScript:

- `https://bestpartschool.com/privacidade/`
- `https://bestpartschool.com/suporte/`
- `https://bestpartschool.com/excluir-conta/`

Confirme que abrem publicamente após o deploy. O contêiner frontend deve publicar o novo `dist/`; adicionar a rota no backend não publica essas páginas.

Depois do deploy, rode `npm run mobile:check:api`. O comando consulta os endpoints novos sem login e verifica CORS para as duas origens nativas. Ele deve passar antes do envio; os comandos de release assinado também executam essa proteção. A verificação confirma a disponibilidade das rotas e do CORS, mas não substitui o teste autenticado em aparelhos. Na verificação de preparação, o domínio Django e o prefixo `/api/` responderam corretamente; o backend antigo ainda não continha consentimento e não liberava o CORS nativo.

No Docker/EasyPanel, contato, nome do responsável e site público são argumentos de build (`VITE_SUPPORT_EMAIL`, `VITE_ORGANIZATION_NAME`, `VITE_ORGANIZATION_ID`, `VITE_PUBLIC_SITE_URL`). Reconstrua o frontend ao alterá-los para atualizar também o HTML estático. Já os domínios de API e mídia continuam configuráveis em runtime no contêiner web. O app nativo sempre exige regeneração do pacote para atualizar sua configuração pública.

## Conta de revisão das lojas

No terminal do backend atualizado, crie uma conta exclusiva:

```bash
python manage.py create_store_review_student --email app-review@bestpartschool.com
```

O comando pede a senha duas vezes, não a imprime, não modifica contas existentes e cria somente um aluno e conteúdo fictício, com professor de demonstração sem login. Não cria cobranças. A autorização de IA continua pendente para que o revisor veja a escolha real no aplicativo.

Cadastre esse login e a senha em **App Review Information** na Apple e **Acesso ao app** no Google. Explique que o aplicativo é para alunos matriculados e que a conta oferece material fictício para avaliação. Garanta acesso durante todo o período de revisão. Não use uma conta de aluno real nem forneça credenciais administrativas.

As denúncias de IA ficam disponíveis no Django Admin em **AI content reports**, com status e notas de resolução. A equipe que analisa denúncias precisa de acesso administrativo apropriado.

## Android / Google Play

1. Crie ou verifique a conta no [Play Console](https://support.google.com/googleplay/android-developer/answer/6112435). O cadastro tem taxa única de US$ 25. Escolha o tipo de conta que corresponde ao responsável pelo app.
2. Instale Android Studio compatível com Capacitor 8, JDK 21 e SDK Android 36. O projeto já usa `compileSdk=36`, `targetSdk=36` e `minSdk=24`.
3. Execute `npm run mobile:prepare` e `npm run mobile:android`. Valide o app em um Android real com o backend atualizado.
4. No Android Studio, use **Build → Generate Signed Bundle / APK → Android App Bundle**, escolha Release e crie/seleciona a chave de upload. Guarde a chave e as senhas em armazenamento seguro fora do Git. Cadastre o Play App Signing.
5. Como alternativa ao assistente gráfico, configure no seu terminal/gerenciador de segredos `BPS_ANDROID_KEYSTORE_PATH`, `BPS_ANDROID_KEYSTORE_PASSWORD`, `BPS_ANDROID_KEY_ALIAS` e `BPS_ANDROID_KEY_PASSWORD`; execute `npm run mobile:release:android`. O comando recusa gerar o release final sem essas credenciais.
6. O AAB fica em `android/app/build/outputs/bundle/release/app-release.aab`. Um AAB produzido apenas por `./gradlew bundleRelease` sem credenciais serve para validar compilação e **não é o pacote assinado para envio**.
7. Crie o app no Play Console, confirme o package name e complete nome, descrições, ícone 512×512, imagem de destaque 1024×500, screenshots, países, suporte, classificação, público-alvo e acesso dos revisores. Use as URLs públicas acima.
8. Preencha Segurança dos dados conforme `docs/DECLARACOES_LOJAS.md`. Envie primeiro ao teste interno e avalie o relatório de pré-lançamento.
9. Se sua conta pessoal foi criada depois de 13/11/2023, realize teste fechado com pelo menos 12 participantes inscritos continuamente por 14 dias e solicite acesso à produção. O teste interno não substitui esse requisito.
10. Depois da validação, envie a versão para revisão e libere em produção. Monitore falhas, denúncias de IA e suporte.

Referências: [assinatura do Android](https://developer.android.com/studio/publish/app-signing), [target API exigido](https://support.google.com/googleplay/android-developer/answer/11926878), [teste fechado obrigatório quando aplicável](https://support.google.com/googleplay/android-developer/answer/14151465).

## iOS / App Store

1. Inscreva-se no [Apple Developer Program](https://developer.apple.com/help/account/membership/program-enrollment/). O valor informado é US$ 99/ano ou equivalente local. Para organização, prepare os dados da entidade e o D-U-N-S.
2. Registre o Bundle ID `com.bestpartschool.student` e crie o registro do app no App Store Connect. Faça login no Xcode em **Settings → Accounts**.
3. Execute `npm run mobile:prepare` e `npm run mobile:ios`. No target App, selecione sua equipe em **Signing & Capabilities** e confirme Version/Build.
4. O projeto é universal: suporta iPhone e iPad. Valide a interface nos dois formatos e prepare screenshots correspondentes. O mínimo do app é iOS 15; o binário precisa ser compilado com um SDK aceito atualmente pela Apple. A exigência consultada é iOS SDK 26 ou superior.
5. No Xcode, selecione um dispositivo iOS genérico e execute **Product → Archive**. Ou configure `BPS_APPLE_TEAM_ID` e use `npm run mobile:release:ios`, que gera `.release/mobile/BestPartSchool.xcarchive` utilizando sua conta/certificados do Xcode. O comando não envia o app à Apple.
6. No Organizer, escolha **Distribute App → App Store Connect → Upload**. Distribua primeiro no TestFlight e teste áudio, permissões, sessão e anexos em aparelhos reais.
7. Complete descrição, screenshots, suporte, política de privacidade, classificação etária, países e declarações de criptografia. Informe o login de revisão e explique os fluxos de IA e exclusão. Revise o relatório de privacidade do Archive; os manifests dos SDKs são incorporados ao binário.
8. Escolha o build aprovado nos testes, envie ao App Review e selecione liberação manual se quiser controlar o momento da publicação.

Referências: [distribuição pelo Xcode](https://developer.apple.com/documentation/xcode/distributing-your-app-for-beta-testing-and-releases/), [SDK mínimo](https://developer.apple.com/news/?id=ueeok6yw), [envio para revisão](https://developer.apple.com/help/app-store-connect/manage-submissions-to-app-review/submit-an-app).

## Validação em aparelhos antes de enviar

Esta etapa precisa usar a API já atualizada; testes com dados simulados não a substituem.

- Login; fechar e abrir; expirar/renovar token; logout e entrada com outro aluno.
- Verificar que cada aluno vê apenas seus dados e não acessa gestão ou cobranças no app.
- Abrir aula, atividade, imagem, PDF e link externo; fechar o navegador interno e retornar ao app.
- Gravar, cancelar, negar permissão, repetir gravação, interromper com chamada/segundo plano, usar fones e reproduzir feedback.
- Recusar IA e continuar com aulas; autorizar; enviar texto/áudio; denunciar resposta; revogar e confirmar novo bloqueio de envio.
- Perder conexão durante upload e tentar novamente sem duplicar respostas.
- Com outra conta fictícia, executar a exclusão e confirmar que o login deixa de funcionar.
- Conferir teclado, safe areas, VoiceOver/TalkBack, orientação e iPad.

## CI e materiais

O CI verifica lint, tipos, scripts mobile, testes, build web/aluno, dependências de produção, interface em navegador e backend com PostgreSQL. O workflow manual **Native mobile validation** compila Release sem distribuição, para Android, iOS ou ambos. Ele não tem credenciais de loja e não publica.

Ícones, imagens e capturas de demonstração ficam em `docs/store-assets/`. Os ícones/splash derivam do logo existente em `public/img/bps-logo.png`. As fontes são empacotadas localmente; o app não precisa consultar Google Fonts. Confira visualmente as capturas antes de cadastrá-las nas lojas.

Há um aviso upstream de gravidade baixa no Quill 2.0.3, reportado também pelo wrapper do editor. A exportação semântica afetada está explicitamente desativada (`useSemanticHTML=false`), preservando o comportamento do editor anterior; o HTML exibido ao aluno passa pela allowlist de `sanitizeRichText`, com testes para scripts, eventos e links executáveis. Não foi aplicado um downgrade apenas para ocultar o aviso. A auditoria de dependências bloqueia novas vulnerabilidades altas/críticas no CI.
