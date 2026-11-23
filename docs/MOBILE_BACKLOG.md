# Acompanhamento do lançamento mobile

Escopo aprovado para a versão 1.0.0: acesso de alunos já matriculados às aulas, materiais, atividades e práticas opcionais de IA, sem compras, cobranças ou catálogo comercial no app. Visão de produto: [PLANO_MOBILE.md](./PLANO_MOBILE.md). Publicação: [PUBLICAR_APP.md](./PUBLICAR_APP.md).

## Implementado e verificado no repositório

- [x] Entradas e builds independentes de site, gestão, legado e aluno.
- [x] Integração da `main` à feature preservando os fluxos atuais de speaking, escrita e interpretação.
- [x] Escopo de usuários, aulas, materiais, homework, grupos, cursos e financeiro por conta e professor responsável.
- [x] Restrição de cadastro, campos de privilégio, alterações financeiras e ações de gestão na API.
- [x] Arquivos privados com links assinados temporários e suporte a HTTP Range para áudio.
- [x] Sessão persistente segura no nativo, renovação coordenada e proteção contra troca de conta durante requisições.
- [x] Consentimento explícito e revogável para envio de dados à OpenAI; denúncias de IA com fila administrativa.
- [x] Exclusão de conta pelo próprio aluno com senha atual e limpeza de arquivos sem outras referências.
- [x] Privacidade, suporte e solicitação de exclusão públicos, inclusive HTML estático sem JavaScript.
- [x] Ícones e splash com a identidade existente da escola; fontes locais; screenshots fictícias para as lojas.
- [x] Links HTTPS, PDF, e-mail e telefone encaminhados aos recursos nativos.
- [x] Configuração de produção HTTPS/PostgreSQL, migrações e scripts de versão, preparação e assinatura.
- [x] Compatibilidade das atualizações de dependências, lint, tipos, testes frontend/backend e interface responsiva.
- [x] Compilação iOS Release sem assinatura e Android AAB Release sem assinatura, com lint Android.
- [x] Conta fictícia para revisores por comando dedicado, sem dados de alunos reais nem cobranças.

Resultados e limites: [RELEASE_VALIDATION.md](./RELEASE_VALIDATION.md).

## Operação necessária antes da submissão

- [ ] Revisar dados definitivos do responsável e confirmar que o e-mail temporário de suporte está operacional.
- [ ] Fazer backup e publicar backend/site atualizados em homologação, depois em produção.
- [ ] Confirmar os endpoints em `https://api.bestpartschool.com/api/`, CORS para as duas origens nativas e mídia protegida.
- [ ] Executar os cenários do guia em iPhone/iPad e Android reais, incluindo microfone, interrupções, reconexão, sessão e exclusão.
- [ ] Criar a conta fictícia de revisão no backend publicado e manter acesso durante a avaliação das lojas.
- [ ] Gerar e guardar chave de upload Android; configurar a equipe/certificados Apple e gerar pacotes assinados.
- [ ] Preencher as declarações conforme a operação real, testar via Google Play/TestFlight e submeter.

Compilar sem assinatura e testar com serviços simulados não comprova esses itens. O domínio Django e o prefixo `/api/` foram confirmados; a versão publicada ainda não continha consentimento nem o CORS nativo. Após o deploy, `npm run mobile:check:api` deve passar antes da geração dos pacotes assinados.

## Evolução posterior

Compras/faturamento nas lojas, notificações APNs/FCM, compartilhamento nativo de arquivos e separação adicional em pacotes são trabalhos futuros. A versão inicial não depende deles. Qualquer cobrança futura precisa de um fluxo completo conforme produto, loja e mercado. Não retirar o acesso web dos alunos antes da disponibilidade dos apps.
