Sequência de implementação mobile

Este arquivo acompanha a primeira base implementada. Visão de produto: [PLANO_MOBILE.md](./PLANO_MOBILE.md). Execução local: [MOBILE_DEVELOPMENT.md](./MOBILE_DEVELOPMENT.md).

**Concluído nesta etapa**

- [x] Entradas e builds independentes: legado, site, gestão e aluno.
- [x] Projetos Android e iOS com Capacitor e plugins sincronizados.
- [x] Sessão persistente por plataforma e renovação de JWT.
- [x] Permissões de interface por perfil e separação de páginas no build.
- [x] Configuração HTTPS explícita para gerar o app.
- [x] Formatos de áudio e upload preparados para MP4/WebM/WAV.
- [x] Eventos de ciclo nativo e botão Voltar do Android.
- [x] Testes de regressão da base e comandos de desenvolvimento.
- [x] Navegação do aluno por Início, Aulas, Estudar, IA e Perfil, com layout dedicado ao celular.
- [x] Início com próxima ação baseada em dados reais e estados de carregamento/erro.
- [x] Área de estudos, perfil com foto e login adaptado para toque.
- [x] Comando e guia de live reload iOS, com projeto de desenvolvimento separado.

**Próxima entrega: autorização da API antes de compartilhar o beta**

Achados concretos da leitura do código atual, sem teste de exploração:

- [ ] `accounts.UserListView` e `UserDetailView`: substituir acesso global por escopo do próprio usuário, professor responsável e administrador conforme a operação.
- [ ] Restringir campos alteráveis por perfil. Um aluno não pode alterar papéis, senha de terceiros, vínculo financeiro ou campos pedagógicos de gestão.
- [ ] Cadastro: impedir criação pública de papéis de professor/admin. Preservar criação de aluno pelo professor responsável por caminho autorizado.
- [ ] `marketplace.CourseViewSet`: permitir leitura pública quando desejada e exigir autorização para criação, alteração e exclusão. Remover a escolha de um usuário arbitrário para criação anônima.
- [ ] Exercitar listagem, consulta, alteração e exclusão com dois alunos, professores distintos e administrador. Verificar também métodos e campos alternativos.

Conclusão: testes demonstram isolamento por objeto, campo e papel sem perder os fluxos autorizados de gestão. Esses pontos impedem considerar esta base pronta para distribuição.

**Prova técnica com dados reais**

- [ ] Obter URL HTTPS da API e da mídia de homologação e conta de aluno de teste.
- [ ] Preparar Xcode, JDK e Android Studio/SDK; compilar os projetos gerados.
- [ ] Login, fechar/abrir app, renovar token, sair e entrar com outro aluno.
- [ ] Abrir aula, anexos, PDF, gravação e link do encontro; retornar ao app.
- [ ] Gravar e enviar speaking, processar no backend e reproduzir resposta em iPhone e Android.
- [ ] Repetir com permissão negada, fones, interrupção, segundo plano, perda e retorno de conexão.
- [ ] Registrar evidência por modelo de aparelho e versão do sistema.

Conclusão: a mesma fatia funcional funciona nos dois aparelhos com a API real, sem perda de sessão ou exposição de dados entre contas.

**Paridade e experiência do aluno**

- [ ] Matriz por ação para painel, aulas, homework, vocabulário, revisão, jogo, IA, intérprete, perfil, financeiro e marketplace.
- [ ] Teclado, safe areas, botões de toque, fontes, leitor de tela e rolagem.
- [ ] Abrir links externos e compartilhar/baixar arquivos por integrações adequadas.
- [ ] Substituir ações incompletas, incluindo recuperação de senha e checkout, por fluxos completos conforme escopo aprovado.
- [ ] Separar carregamento das telas maiores para reduzir o JavaScript inicial.
- [x] Criar configuração Playwright independente e verificar navegação, login visual, área de estudos, perfil, composer e histórico com dados simulados.
- [ ] Automatizar login → estudo → envio → feedback usando backend de homologação.
- [ ] Revisar cache privado e tratar reenvio para evitar respostas e pagamentos duplicados.

Conclusão: todas as ações da matriz têm evidência em ambos os sistemas e estados claros de carregamento, erro e reconexão.

**Notificações, compras e publicação**

- [ ] Definir produtos comerciais: aulas individuais, grupos, materiais e/ou assinatura de IA.
- [ ] Validar o financeiro e escolher integração de cobrança adequada ao produto/loja/mercado; não transportar o fluxo PIX atual como cobrança pronta.
- [ ] Implementar notificações com APNs/FCM, registro por dispositivo e desvinculação no logout.
- [ ] Definir nome e identificador finais, ícones, splash, versões e assinatura.
- [ ] Preparar privacidade, consentimentos de IA, exclusão de conta, suporte e declarações das lojas.
- [ ] TestFlight e teste Google Play com participantes reais; corrigir falhas e submeter.
- [ ] Publicar site institucional com SEO/pré-renderização e links das lojas disponíveis.
- [ ] Migrar gestão para endereço próprio e redirecionar links antigos depois do piloto.

Conclusão: beta validado, pendências de autorização resolvidas, pacotes assinados e submissões completas. Não retirar o acesso web do aluno antes da disponibilidade dos apps.
