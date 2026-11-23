Plano de evolução mobile — Best Part School

Data: 19/10/2026. Proposta baseada na leitura do repositório e das documentações oficiais abaixo. Não houve implementação nem testes em aparelhos nesta análise.

**Decisão proposta**

Manter React + TypeScript + Vite e adicionar Capacitor para gerar os aplicativos iOS e Android. Manter Django REST Framework e PostgreSQL como backend compartilhado. Separar a experiência pública, a gestão e o aplicativo do aluno em entradas e builds independentes, dentro do mesmo repositório.

O Capacitor executa a interface web empacotada dentro de um aplicativo com acesso a recursos nativos por plugins. A interface não passa automaticamente a usar componentes nativos. A adaptação de navegação, teclado, áudio, desempenho e acessibilidade faz parte do projeto. A maior parte do código de produto será comum; permissões, assinatura e alguns ajustes continuam específicos de cada sistema. [Documentação do Capacitor](https://capacitorjs.com/docs).

**O que existe e será aproveitado**

| Parte | Situação observada | Direção |
| --- | --- | --- |
| Interface | React 18, TypeScript, Vite, Tailwind, shadcn/Radix | Reaproveitar componentes compatíveis e adaptar telas para toque |
| Dados e formulários | TanStack Query, Axios, React Hook Form, Zod | Reaproveitar e separar dependências de plataforma |
| API | Django, DRF, SimpleJWT | Evoluir a API existente, sem duplicar regras no app |
| Banco | PostgreSQL na configuração e no Docker | Manter banco central, contas e histórico existentes |
| Rotas | Landing pública e área `/app` já identificadas | Transformar a separação de rotas em separação de builds |
| Navegação | Menu por perfil, barra inferior e uso de safe areas | Usar como ponto de partida, validar em aparelhos |
| Mídia e IA | Gravação pelo navegador, reprodução, chamadas à API | Validar no iPhone e Android antes de migrar todas as telas |
| Login | Access token em localStorage; refresh disponível no backend | Criar sessão adequada ao app com renovação e armazenamento seguro |
| Marketplace | Listagem existe; botão Comprar sem ação em `Marketplace.tsx` | Tratar checkout e liberação de acesso como desenvolvimento adicional |

Não há evidência suficiente para prometer um percentual exato de reaproveitamento. API, regras, dados, utilitários e diversos componentes podem permanecer; o volume de adaptação visual e de mídia será medido na prova técnica.

**Comparação das alternativas**

| Opção | Reaproveitamento desta aplicação | Custo de adaptação | Avaliação |
| --- | --- | --- | --- |
| React + Capacitor | Alto, inclusive interface web | Ajustes mobile e integrações nativas | Recomendação inicial para este projeto |
| React Native + Expo | API, tipos, regras e parte dos hooks; telas DOM/Radix precisam de adaptação ou reescrita | Maior investimento na interface | Alternativa se a prova técnica revelar limitações relevantes de mídia ou desempenho |
| Flutter | API e conceitos de negócio | Reescrita do frontend em Dart | Pouco alinhado à prioridade de aproveitar o código |
| PWA | Alto | Menor para distribuição pela web | Pode complementar o acesso pelo navegador; não atende sozinha ao objetivo de publicar os dois apps |

React Native usa componentes próprios como View e Text, portanto React web e React Native não oferecem reaproveitamento automático de todas as telas. [Componentes do React Native](https://reactnative.dev/docs/components-and-apis).

Não adicionar Ionic UI como requisito inicial: as telas atuais já usam Tailwind/shadcn. Avaliar componentes específicos apenas se trouxerem benefício demonstrável, evitando manter dois sistemas completos de interface.

**Produtos e organização do código**

Domínios abaixo são exemplos de responsabilidades, não domínios já configurados:

- Site público: domínio principal, apresentação da escola, cursos, metodologia, depoimentos, contato, suporte, privacidade e links das lojas. Gerar HTML estático/pré-renderizado para as páginas institucionais, com metadados próprios.
- Painel de gestão: subdomínio reservado, com professores, administradores, alunos, CRM, agenda, correções e financeiro.
- Aplicativo do aluno: login e funcionalidades de estudo, distribuído nas duas lojas.
- API: endereço HTTPS estável, compartilhado por todos os clientes.

Estrutura sugerida, adotada progressivamente:

```text
apps/
  site/                  # conteúdo institucional
  admin/                 # painel web de professores e administradores
  student/               # React/Vite + Capacitor
    ios/                 # projeto Xcode
    android/             # projeto Android Studio
packages/
  api-client/            # chamadas, tipos, erros e contratos da API
  domain/                # regras e utilitários independentes de plataforma
  ui/                    # componentes web compartilháveis
  platform/              # sessão, áudio, arquivos, links e notificações
backend/                 # Django existente
```

Usar npm workspaces e um único lockfile como organização inicial; o repositório hoje contém arquivos de lock de npm e Bun. Não introduzir uma ferramenta de monorepo adicional sem necessidade.

Cada aplicação terá entrypoint, rotas e build próprios. O build do aluno não incluirá páginas administrativas ou a landing como dependências. Mesmo assim, a API continuará verificando todas as permissões: omitir uma tela não protege uma operação.

O código e os assets do app serão incluídos no pacote instalado. O aplicativo consultará a API remota para dados; não usará o endereço do site como interface remota em produção. Manter compatibilidade da API com versões antigas dos apps, porque a atualização dos usuários não é simultânea. Publicar mudanças do app pelas lojas, com versionamento e assinatura próprios de cada sistema.

**Escopo funcional do aluno**

| Funcionalidade | Trabalho previsto |
| --- | --- |
| Login e perfil | Sessão persistente, renovação, recuperação de senha, foto, logout e gestão da conta |
| Meu painel | Próxima aula, tarefas, progresso e indicadores já existentes |
| Minhas aulas | Histórico, detalhes, materiais, resumos, gravações e links de encontro |
| Agenda | Validar todos os fluxos atualmente liberados ao aluno e sua relação com Minhas Aulas |
| Homework | Respostas, anexos, áudio, correções, feedback e recuperação de falhas de envio |
| Palavras e flashcards | Categorias, áudio, revisão e persistência do progresso |
| Jogo de vocabulário | Interação por toque e desempenho em aparelhos intermediários |
| Praticar com IA | Conversas, texto, speaking, writing, histórico e feedback |
| Intérprete IA | Listening, gravação, reprodução e histórico |
| Financeiro | Histórico, contratos e fluxos existentes, com desenho de cobrança adequado às lojas |
| Marketplace | Catálogo; concluir compra e concessão de acesso caso entrem na versão de lançamento |

O inventário final deve acompanhar ações reais e permissões, e não apenas nomes de páginas. Não transformar um recurso parcial da web em uma promessa de recurso pronto no app.

Navegação proposta: Início, Aulas, Atividades, IA e Perfil. Atividades agrupa homework, vocabulário e jogo; Perfil dá acesso a financeiro, marketplace, ajuda e conta. Validar essa organização com alunos antes de consolidar.

**Integrações e requisitos técnicos**

- Sessão: access token de curta duração, renovação usando o endpoint existente, refresh protegido por Keychain no iOS e armazenamento protegido pelo Keystore no Android, por uma integração mantida e validada. Não usar Preferences como cofre de credenciais. Tratar revogação, expiração, logout e limpeza dos dados do usuário.
- API: cliente compartilhado com tratamento de erros, limite de tempo, renovação coordenada do token e controle de repetição para evitar envios duplicados. Definir configuração explícita de API e mídia em HTTPS; o fallback atual baseado no hostname e porta 8000 não serve como configuração de produção mobile.
- Áudio: criar uma interface comum de gravação e reprodução. Testar formatos realmente suportados, duração, upload, cancelamento, permissão negada, fones e interrupções. O gravador atual tenta WebM e depois WAV; essa escolha precisa de validação em ambos os sistemas. Se necessário, usar plugin nativo ou implementação própria pequena por plataforma, mantendo a mesma API TypeScript.
- Arquivos e links: integrar seletor/câmera conforme necessidade, Filesystem, Share, Clipboard, Browser e abertura de links de aulas. Validar PDFs, anexos e retorno ao app depois de abrir serviços externos.
- Navegação: tratar botão Voltar do Android, teclado, barras do sistema, safe areas, tamanhos de fonte, acessibilidade e links que abrem diretamente uma tela do app.
- Notificações: Capacitor Push Notifications com APNs no iOS e FCM no Android. Backend registra dispositivos por usuário e remove vínculos no logout. Para lembretes agendados e repetição confiável, usar um worker, como Celery + Redis, quando essa etapa for implementada. Não enviar conteúdo sensível na notificação. [Plugin de push](https://capacitorjs.com/docs/apis/push-notifications).
- Conexão: estados de falta de internet e recuperação de envio na primeira versão. IA, financeiro e sincronização continuam dependentes da API. Offline com edição e resolução de conflitos será uma etapa separada, se desejada.
- Operação: ambientes separados de desenvolvimento, homologação e produção, logs sem credenciais, acompanhamento de falhas e pipeline de build/assinatura. Chaves de IA e credenciais de serviços permanecem no backend.

**Pendências concretas antes da distribuição**

1. Revisar autorização de contas: `UserListView` e `UserDetailView` usam queryset global e somente `IsAuthenticated`. Separar acesso ao próprio perfil das operações de gestão, com limites por objeto e por campo. Incluir cadastro e alteração de perfil para impedir elevação de papel.
2. Restringir escrita de cursos: `CourseViewSet.get_permissions()` retorna `AllowAny` para todas as ações. Definir explicitamente leitura pública e operações de criação/alteração/exclusão permitidas aos perfis responsáveis.
3. Completar sessão mobile: o login atual aproveita apenas `access`, embora o backend já exponha refresh. Criar também o fluxo de recuperação de senha, caso ainda não exista fora do código analisado.
4. Validar o financeiro ponta a ponta. `build_pix_payload` atualmente concatena um texto próprio iniciado por `PIX|`; há também geração de QR por serviço externo. Não considerar a cobrança concluída pela existência dessa tela. Definir se haverá apenas instrução manual, integração com provedor ou compra pelas lojas, e testar o fluxo escolhido.
5. Definir o que o marketplace realmente venderá, como o aluno recebe o conteúdo e como compras serão restauradas e verificadas no servidor quando aplicável.

Esses achados vêm de leitura do código; não foi realizado teste de exploração nem auditoria completa.

**Pagamentos e publicação**

Definir primeiro os produtos: aulas individuais ao vivo, aulas em grupo, material digital e assinatura de IA podem ter tratamentos diferentes. Não assumir que o PIX atual poderá ser usado para qualquer venda no app.

A Apple prevê exceção para serviços ao vivo entre duas pessoas; sua regra distingue aulas em grupo. O Google condiciona sua exceção de serviço individual também à indisponibilidade de replay. Conteúdo digital e assinaturas exigem análise própria, por produto e mercado. Se houver cobrança pelas lojas, acrescentar StoreKit/Google Play Billing por integração compatível com Capacitor, verificação no servidor e restauração de compras. [Apple](https://developer.apple.com/app-store/review/guidelines/#in-app-purchase), [Google](https://support.google.com/googleplay/android-developer/answer/10281818?hl=en).

Preparar experiência própria de aplicativo, com utilidade e interface adequadas: a diretriz 4.2 da Apple avalia aplicativos que apenas reempacotam sites. Capacitor não garante aprovação. Informar e obter consentimento antes do envio de dados pessoais a IA externa. [Diretrizes da Apple](https://developer.apple.com/app-store/review/guidelines/).

Preparar política de privacidade, suporte, declarações de dados das lojas, permissões de microfone/fotos, público etário, credenciais de revisão e fluxo de exclusão de conta conforme o modelo de cadastro. O Google pode exigir também um caminho web para solicitar exclusão. [Exclusão na Apple](https://developer.apple.com/help/app-review/guideline-reference/5-1-1-account-deletion), [Exclusão no Google Play](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en).

Usar contas de desenvolvedor pertencentes à escola. No momento da consulta, Apple Developer custa US$ 99/ano e Google Play cobra US$ 25 de registro único; confirmar moeda, tributos e elegibilidade no cadastro. [Apple Developer](https://developer.apple.com/help/account/membership/program-enrollment), [Play Console](https://support.google.com/googleplay/android-developer/answer/6112435?hl=en).

Compilar iOS exige macOS/Xcode local ou infraestrutura de build macOS. Android usa Android Studio/SDK. Validar versões de SDK e plugins exigidas no início e novamente na submissão. [Ambiente Capacitor](https://capacitorjs.com/docs/getting-started/environment-setup).

Fazer beta por TestFlight e trilhas de teste do Google Play. Para contas pessoais novas do Google Play abrangidas pela regra, prever pelo menos 12 participantes inscritos continuamente por 14 dias antes de solicitar produção. [Requisitos oficiais de teste](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en).

**Sequência de execução e critérios de conclusão**

1. Inventário e decisões de produto. Mapear ações do aluno, dependências e dados; confirmar administração na web, modelo de cobrança e público etário. Resultado: matriz de funcionalidades com critério verificável para cada fluxo.
2. Prova técnica em iPhone e Android físicos. Empacotar uma fatia com login, consulta de aula, gravação, envio para IA, reprodução de resposta e anexo. Resultado: evidência de que os fluxos mais arriscados funcionam; selecionar plugins e confirmar Capacitor ou revisar a escolha.
3. Base compartilhada e API. Criar entradas independentes sem mudar tudo de uma vez; corrigir permissões, sessão e configuração HTTPS. Resultado: builds separados e testes de isolamento de usuários, papéis e campos sensíveis.
4. Migração integral da área do aluno. Adaptar os módulos da matriz, incluindo mídia, financeiro e marketplace conforme escopo definido. Resultado: cada fluxo atual do aluno aprovado em ambos os sistemas, com comportamentos para erros e falta de conexão.
5. Recursos de aparelho e qualidade. Adicionar notificações, links diretos, arquivos e acabamento de navegação. Resultado: validação de permissões negadas, teclado, interrupções, retorno do segundo plano, fones e aparelhos intermediários.
6. Beta e submissão. Usar contas de teste e alunos reais, corrigir falhas e preparar metadados e declarações. Resultado: pacotes assinados, credenciais de revisão e submissões completas; aprovação depende de cada loja.
7. Transição do site. Publicar o site institucional e direcionamento para os apps quando estiverem disponíveis. Manter acesso web durante o piloto; definir redirecionamentos dos links antigos e publicar painel administrativo separado antes de retirar a área do aluno do site público.

Não fixar prazo total antes da prova de áudio/IA e da definição comercial. Planejar capacidade por etapa, mais os períodos externos de beta, cadastro e revisão. As correções de segurança e as funcionalidades ainda incompletas são esforço adicional à adaptação mobile.

**Verificação prevista para a implementação**

Reutilizar Vitest, Playwright e testes Django existentes nos fluxos que continuarem compartilhados. Acrescentar testes relevantes de autorização e renovação de sessão. Fazer testes de integração no ambiente nativo e testes manuais em aparelhos reais: os testes do navegador não validam sozinhos microfone, notificações, teclado e ciclo de vida do aplicativo.

O lançamento estará pronto quando a matriz de funcionalidades tiver paridade aprovada em iOS e Android, os dados existentes estiverem acessíveis com as mesmas contas, a API aplicar isolamento adequado, os pacotes estiverem assinados e as informações exigidas pelas lojas estiverem completas. O corte definitivo do acesso público antigo ocorrerá depois da disponibilidade dos apps.
