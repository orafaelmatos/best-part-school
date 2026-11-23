# Ver a interface no iPhone enquanto desenvolvemos

O app usa o mesmo React que você já conhece. O Capacitor coloca essa interface dentro de um aplicativo iOS e disponibiliza os recursos nativos. O Xcode compila e instala esse aplicativo; você continua editando os arquivos React e CSS neste projeto.

Você tem três formas de acompanhar o trabalho:

| Forma | Quando usar | Atualiza ao salvar? |
| --- | --- | --- |
| Navegador com tela estreita | Ajustar layout e navegar rapidamente | Sim |
| Simulator do Xcode | Conferir comportamento do app iOS no Mac | Sim, com o comando de live reload abaixo |
| Seu iPhone | Conferir toque, teclado, áreas da tela e aparência no aparelho | Sim, com live reload e o mesmo Wi-Fi do Mac |

O Simulator é o simulador de iPhone fornecido pela Apple. Não exige publicar na App Store. O teste no aparelho também pode ser feito diretamente pelo Xcode. [Documentação da Apple](https://developer.apple.com/documentation/xcode/running-your-app-on-simulated-or-physical-devices).

## 1. Começar hoje, pelo navegador

Para testar com dados e login locais, prepare e inicie o Django conforme [TESTAR_API_LOCAL.md](./TESTAR_API_LOCAL.md). Mantenha esse backend em um terminal e abra outro na pasta do projeto:

```bash
cd /Users/matos/Documents/projects/best-part-school
npm run dev:student:local
```

1. Abra `http://localhost:8081` no navegador.
2. No Chrome, abra as ferramentas de desenvolvedor com `Command + Option + I`.
3. Ative a barra de dispositivos com `Command + Shift + M` e escolha um iPhone ou uma largura de 390 pixels.
4. Edite um componente React ou CSS e salve. A página acompanha as mudanças.

Isso permite revisar a interface antes de configurar o Xcode. O navegador não reproduz os plugins nativos, as permissões nem o teclado do iPhone.

## 2. Usar API e banco locais

Você pode desenvolver e fazer login **sem usar a VPS**. O fluxo local fica assim:

```text
iPhone/Simulator → Vite no Mac → Django no Mac → banco SQLite local
```

O Vite recebe as chamadas `/api/` e `/media/` na mesma origem da interface e as encaminha para `127.0.0.1:8000`. O iPhone não precisa acessar a porta 8000 diretamente. Nesse modo, o HTTP é permitido somente no desenvolvimento local; os aplicativos de distribuição continuam exigindo HTTPS para a API.

1. Prepare o banco e uma conta local de aluno seguindo [TESTAR_API_LOCAL.md](./TESTAR_API_LOCAL.md). Os comandos são:

```bash
npm run mobile:db:migrate
npm run mobile:create-student -- --email seu-email-de-teste@example.com --name "Aluno local"
```

2. No primeiro terminal, mantenha o backend iniciado:

```bash
npm run dev:api:mobile
```

3. No segundo terminal, inicie o app com o modo local:

```bash
npm run mobile:live:ios:local
```

Esse comando equivale a `npm run mobile:live:ios -- --local-api --port 8081`. Ele ignora os endereços remotos de API e mídia de `.env.student.local`, confere se a porta 8000 está servindo o backend isolado e interrompe a inicialização se a API não estiver pronta. Não tenta conectar à VPS como alternativa. Não é necessário editar o `.env` para usar o modo local.

Use uma **conta criada no banco local**. Uma conta existente na VPS não passa a existir no SQLite local automaticamente. O proxy mantém a mesma origem das requisições e dispensa uma liberação geral de CORS para esse fluxo.

Os atalhos locais usam a porta **8081**, para permitir que seu servidor atual em 8080 continue aberto. Se a 8081 também estiver ocupada, escolha outra porta:

```bash
npm run mobile:live:ios:local -- --port 8082
```

Depois, execute o app novamente pelo Xcode para ele usar o novo endereço. Se o Django usar outra porta, inicie esse backend e passe a mesma porta ao live reload:

```bash
backend/venv/bin/python backend/manage.py runserver 127.0.0.1:8001 --settings=bps_core.settings_mobile
```

Em outro terminal:

```bash
npm run mobile:live:ios:local -- --api-port 8001
```

### Quando usar uma API HTTPS externa

O comando `npm run mobile:live:ios` sem `--local-api` continua disponível para o teste futuro contra um backend HTTPS. Nesse caso, ele usa `VITE_API_URL` e `VITE_MEDIA_BASE_URL` de `.env.student.local` e exige a configuração de CORS correspondente. O modo local acima não depende desse arquivo.

```dotenv
VITE_API_URL=https://api.seu-dominio.com/api/
VITE_MEDIA_BASE_URL=https://api.seu-dominio.com
```

Esses endereços são exemplos. Nunca coloque senhas, chaves de IA ou outros segredos em variáveis `VITE_`.

## 3. Preparar o Mac uma vez

1. Instale o **Xcode completo** pela App Store do Mac. Apenas Command Line Tools não basta.
2. Abra o Xcode, aceite os termos apresentados e conclua a instalação dos componentes solicitados.
3. Instale o suporte a iOS e um Simulator de iPhone quando o Xcode oferecer. Esses downloads também ficam em **Xcode > Settings > Components**; em algumas versões, a seção se chama **Platforms**.
4. Em **Xcode > Settings > Locations > Command Line Tools**, selecione a versão do Xcode instalada.
5. No terminal, confira:

```bash
node --version
xcode-select -p
xcodebuild -version
```

Este projeto usa Node **22.12 ou superior** e Capacitor 8, que exige **Xcode 26 ou superior**. `xcode-select -p` deve apontar para algo como `/Applications/Xcode.app/Contents/Developer`. Se mostrar `/Library/Developer/CommandLineTools`, refaça a seleção em Locations. O projeto usa Swift Package Manager; não precisa instalar CocoaPods para esta configuração. [Requisitos do Capacitor 8](https://capacitorjs.com/docs/getting-started/environment-setup).

Se a App Store disser que seu macOS não suporta a versão do Xcode, confira a [tabela de compatibilidade da Apple](https://developer.apple.com/support/xcode/). Não instale uma versão antiga abaixo do requisito do Capacitor.

Se as dependências deste projeto ainda não estiverem instaladas, execute `npm ci` na raiz.

## 4. Executar no Simulator com atualização ao salvar

Com o Django local da seção 2 em execução, abra outro terminal. O comando abaixo inicia seu próprio Vite na porta 8081:

```bash
npm run mobile:live:ios:local
```

Seu servidor atual em 8080 pode continuar aberto. Se já iniciou `dev:student:local` na porta 8081, encerre somente esse comando ou escolha outra porta para o live reload com `-- --port 8082`. O comando confere o backend local, inicia o Vite, prepara uma cópia local do projeto iOS e abre o Xcode. Na primeira execução, o Xcode pode levar alguns minutos para resolver os pacotes Swift.

No Xcode:

1. Na barra superior, escolha o esquema **App**.
2. Ao lado do esquema, selecione um **iPhone Simulator** disponível. Não escolha apenas “Any iOS Device”, pois esse destino não inicia um simulador.
3. Clique no botão **▶ Run**, ou pressione `Command + R`.
4. Espere a primeira compilação e a abertura do Simulator.
5. Volte ao editor, altere um texto/estilo e salve. A interface no Simulator deve atualizar sem compilar novamente.

Mantenha o terminal aberto. Para este primeiro teste de interface no Simulator, não é preciso conta paga de desenvolvedor. O Xcode fornece e gerencia os simuladores. [Executar em simuladores e aparelhos](https://developer.apple.com/documentation/xcode/running-your-app-on-simulated-or-physical-devices).

Se a API parar depois da inicialização, mantenha o app aberto, reinicie `npm run dev:api:mobile` e tente novamente. Se o login falhar com a API ativa, confirme que está usando a conta de aluno do banco local.

## 5. Executar no seu iPhone com atualização ao salvar

### Descobrir o IP do Mac

Conecte Mac e iPhone ao mesmo Wi-Fi. No Mac, vá a **Ajustes do Sistema > Wi-Fi > Detalhes > TCP/IP** e copie o endereço IPv4, por exemplo `192.168.1.20`.

Esse IP é o do **Mac**, não o IP do iPhone e não o endereço da API. `localhost` no iPhone aponta para o próprio telefone.

### Preparar assinatura e aparelho

1. Conecte o iPhone ao Mac com um cabo e desbloqueie-o.
2. Toque em **Confiar neste computador** no iPhone, se solicitado, e permita a conexão no Mac.
3. No Xcode, adicione sua Apple Account em **Xcode > Settings > Apple Accounts**; algumas versões chamam a seção de **Accounts**.
4. Abra o gerenciamento de dispositivos pelo Xcode. Conforme a versão, fica em **Window > Devices and Simulators** ou em **Device Hub**. Selecione/pareie seu iPhone e siga as instruções.
5. No iPhone com iOS 16 ou posterior, habilite **Ajustes > Privacidade e Segurança > Modo de Desenvolvedor**. Reinicie e confirme a ativação quando solicitado. A opção pode aparecer somente após iniciar o pareamento com o Mac. [Modo de Desenvolvedor da Apple](https://developer.apple.com/documentation/xcode/enabling-developer-mode-on-a-device).

Você pode usar uma **Personal Team** da sua conta Apple para testar no seu aparelho. Essa assinatura gratuita tem limitações e o perfil normalmente expira em sete dias; depois é preciso compilar e instalar novamente pelo Xcode. App Store e TestFlight exigem a inscrição apropriada no Apple Developer Program. [Conta e Personal Team](https://developer.apple.com/help/account/basics/about-your-developer-account).

### Iniciar o app

O Django precisa aceitar o IP privado do Mac no cabeçalho da requisição encaminhada pelo Vite. Se ele já estiver aberto sem essa configuração, reinicie somente o backend local com o IP correto:

```bash
BPS_MOBILE_ALLOWED_HOSTS=192.168.1.20 npm run dev:api:mobile
```

Mantenha esse terminal aberto. O servidor continua escutando apenas em `127.0.0.1`; a porta 8000 não fica exposta ao iPhone.

Em outro terminal, para mudar uma sessão de live reload do Simulator para o iPhone, encerre somente essa sessão com `Control + C` e rode, substituindo o IP pelo do seu Mac:

```bash
npm run mobile:live:ios:local -- --host 192.168.1.20
```

O atalho local usa 8081. Se essa porta já estiver ocupada, acrescente `--port 8082` ao final do comando. Não use `localhost` como `--host` para um iPhone físico. O proxy do Vite continua acessando o Django por `127.0.0.1` no Mac.

No Xcode que abrir:

1. Clique no projeto azul **App** na barra esquerda.
2. Em **Targets**, escolha **App** e abra **Signing & Capabilities**.
3. Marque **Automatically manage signing** e selecione sua conta em **Team**. Pode aparecer como `Seu Nome (Personal Team)`.
4. Se o identificador `com.bestpartschool.student` estiver indisponível para sua conta, use **somente nessa cópia de desenvolvimento** um identificador único, como `com.seunome.bestpartschool.dev`. Não altere o identificador do projeto de distribuição para resolver esse teste.
5. Na barra superior, selecione o seu iPhone e pressione `Command + R`.
6. Se o iPhone solicitar confiança no desenvolvedor, siga a orientação mostrada em **Ajustes > Geral > VPN e Gerenciamento de Dispositivo**.
7. Se houver pedido para acesso à **Rede Local**, permita-o para o app de desenvolvimento.

Agora, ao salvar os arquivos React/CSS no editor, a interface deve atualizar no iPhone. O cabo ajuda no pareamento e na instalação; o live reload continua dependendo da conexão de rede entre iPhone e Mac. Se o Mac solicitar permissão de firewall para o Node, permita a conexão nessa rede de desenvolvimento. O fluxo de live reload do Capacitor usa um servidor local acessível pelo aparelho. [Live reload do Capacitor](https://capacitorjs.com/docs/guides/live-reload).

## 6. O que exige uma nova compilação

| Mudança | Procedimento |
| --- | --- |
| React, CSS, textos, espaçamentos | Salvar; Vite atualiza a interface |
| Código Python do Django local | Salvar; o servidor local normalmente recarrega sozinho |
| Modelo de dados do Django local | Aplicar as migrações no banco local conforme o guia da API |
| Variável em `.env.student.local` | Encerrar e iniciar o comando novamente; abrir o app de novo |
| IP ou Wi-Fi do Mac | Encerrar e iniciar com o novo `--host`; executar novamente no Xcode |
| Plugin Capacitor instalado/atualizado | Encerrar, iniciar de novo para sincronizar e executar no Xcode |
| Arquivo Swift, permissão, ícone ou configuração do projeto iOS | Gerar uma nova cópia de desenvolvimento e compilar novamente |

A cópia de desenvolvimento fica em `.mobile-live-ios/`, ignorada pelo Git. O comando a reutiliza para preservar sua seleção local de assinatura. Depois de mudanças nos arquivos nativos em `ios/`, encerre a sessão, feche o projeto no Xcode, apague **apenas `.mobile-live-ios/`** pelo Finder e execute o comando novamente. Isso recria a cópia com os arquivos atualizados; será preciso selecionar a Team outra vez.

## 7. Conferir o app sem depender do Mac

O modo local das seções anteriores depende do Vite e do Django no Mac. Continue usando esse fluxo enquanto estiver desenvolvendo sem VPS.

Quando quiser testar uma versão que leva a interface dentro do aplicativo, configure a API HTTPS real em `.env.student.local`, pare a sessão e execute:

```bash
npm run mobile:sync
npm run mobile:ios
```

O segundo comando abre o projeto principal em `ios/`. Selecione sua Team e o aparelho/Simulator nesse projeto e pressione `Command + R`. Essa versão usa a API HTTPS configurada e precisa de internet, mas sua interface não depende do Vite nem do Mac ligado. A opção `--local-api` não é aceita em um build de distribuição.

Para ver novas alterações de interface nessa modalidade, repita `mobile:sync` e execute novamente no Xcode. Ainda não é distribuição pela App Store.

Para validar gravação de áudio e permissões, use também essa versão com a interface empacotada: o HTTP de uma página na rede local pode limitar APIs web que exigem contexto seguro. A revisão visual por live reload não substitui o teste completo no aparelho.

## 8. Resolver problemas comuns

| Sintoma | O que conferir |
| --- | --- |
| Comando pede API HTTPS, mas quero desenvolver só no Mac | Use `npm run mobile:live:ios:local`; ele dispensa API externa e ignora os endereços remotos do `.env` |
| Comando diz que a API local não está pronta | Inicie `npm run dev:api:mobile` em outro terminal; siga [TESTAR_API_LOCAL.md](./TESTAR_API_LOCAL.md) para preparar o banco |
| Porta 8000 não serve o backend isolado | Use o comando `dev:api:mobile`, que seleciona as configurações e o banco próprios do teste mobile |
| Django mostra “Invalid HTTP_HOST” no iPhone | Inicie o backend com `BPS_MOBILE_ALLOWED_HOSTS` contendo o IP privado atual do Mac, conforme a seção 5 |
| Tela abre, mas login/dados falham no modo local | Backend local em execução, migrações aplicadas e uma conta de aluno criada naquele banco |
| Tela abre, mas login/dados falham com API HTTPS | API acessível, credenciais de aluno e CORS da origem com IP/porta usados |
| iPhone fica em branco ou não conecta | Terminal ainda aberto, mesmo Wi-Fi, IP correto, Rede Local permitida e firewall do Mac |
| Não abre `http://IP_DO_MAC:8081` no Safari do iPhone | Resolva primeiro a conexão de rede; redes de convidados podem impedir conexão entre dispositivos |
| A página abre no Safari, mas o app não conecta | Feche e execute o app de novo pelo Xcode; confira o IP usado no comando e a permissão de Rede Local |
| IP mudou após reconectar Wi-Fi | Inicie o comando com o novo IP e execute o app no Xcode novamente; o proxy local não exige ajustar CORS |
| Interface não acompanha alterações | Confira se abriu `.mobile-live-ios/App/App.xcodeproj` e está com o comando de live reload em execução |
| Xcode mostra apenas “Any iOS Device” | Instale um Simulator em Settings > Components/Platforms ou conecte/pareie o iPhone |
| Xcode pede Team ou falha no provisioning | Selecione sua conta em Signing & Capabilities; use um identificador de desenvolvimento disponível |
| App da Personal Team parou após alguns dias | Execute novamente pelo Xcode para renovar a instalação de desenvolvimento |
| Gravação não funciona no live reload HTTP | Faça o teste na versão empacotada da seção 7, com permissão de microfone |

No Safari do iPhone, abrir a URL do Mac é apenas um diagnóstico de rede; não abre o app nativo. O Simulator também não reproduz todos os recursos nem o desempenho de um iPhone real. [Limites dos testes em simuladores](https://developer.apple.com/documentation/xcode/running-your-app-on-simulated-or-physical-devices).

## 9. Encerrar e preparar distribuição

Encerre com `Control + C`. O comando desliga o Vite e remove o endereço do servidor da configuração gerada na cópia de desenvolvimento. O app de live reload já instalado pode deixar de abrir até você iniciar outra sessão e executá-lo novamente.

O projeto principal `ios/` permanece separado desse servidor local. A cópia `.mobile-live-ios/` inclui uma barreira de compilação para impedir builds sem `DEBUG`; não use esse projeto para arquivar ou publicar. Se o terminal for encerrado à força, uma URL de desenvolvimento pode permanecer na cópia ignorada, mas não entra no projeto principal.

Para gerar a versão de distribuição, use `npm run mobile:sync` e o projeto principal aberto por `npm run mobile:ios`. Faça a configuração de assinatura, ícones, versão, privacidade e revisão das lojas nessa versão. Não configure `server.url` de desenvolvimento em uma versão destinada aos alunos.

Os ajustes de rede do live reload ficam somente na cópia de desenvolvimento: `NSAllowsLocalNetworking` e um texto explicando o acesso à Rede Local. O projeto principal não recebe liberação geral de HTTP. [Rede local e ATS na Apple](https://developer.apple.com/documentation/bundleresources/information-property-list/nsapptransportsecurity/nsallowslocalnetworking), [texto de finalidade da Rede Local](https://developer.apple.com/documentation/bundleresources/information-property-list/nslocalnetworkusagedescription).
