# Informações para os formulários das lojas

Estas informações descrevem o código desta versão. Confirme as práticas reais dos serviços de hospedagem, dos fornecedores e da operação da escola antes de enviar os formulários.

## Cadastro

- Nome: Best Part School.
- Identificador: `com.bestpartschool.student`.
- Categoria proposta: Educação.
- Distribuição: app gratuito para alunos já matriculados; sem compras, anúncios ou cobranças no aplicativo mobile.
- Suporte provisório: `gabriel@bestpartschol.com`, conforme informado pelo responsável pelo projeto. Substituir quando o contato definitivo estiver disponível.
- Privacidade: `https://bestpartschool.com/privacidade/`.
- Suporte: `https://bestpartschool.com/suporte/`.
- Exclusão fora do app: `https://bestpartschool.com/excluir-conta/`.
- Exclusão no app: Perfil → Privacidade e IA → Excluir minha conta.
- Conta de revisão: criar pelo comando em `PUBLICAR_APP.md` e informar as credenciais diretamente nos consoles, nunca no Git.

## Dados tratados pelo aplicativo

| Dado | Finalidade | Observação |
| --- | --- | --- |
| Nome, e-mail e ID da conta | Login, identificação, acesso às aulas | Vinculados ao usuário |
| Foto de perfil | Personalização | Envio opcional |
| Áudio de prática | Transcrição e prática educacional | Opcional; microfone acionado pelo aluno |
| Textos, respostas e conversas | Atividades e feedback | Vinculados ao aluno |
| Progresso, aulas e histórico | Acompanhamento educacional | Vinculados ao aluno |
| Consentimento e denúncias | Preferências e análise de conteúdo | Registrados no backend |

O backend compartilhado também atende contratos, comprovantes e financeiro da plataforma web. Essas telas e seus campos de entrada não fazem parte da primeira versão mobile. Não extrapole declarações da plataforma web para o app sem conferir o fluxo de coleta efetivo.

## Apple: App Privacy

Mapeie os dados acima para as categorias correspondentes, como informações de contato, identificador do usuário, fotos/áudio e outros conteúdos do usuário. Eles servem à funcionalidade do app e, quando aplicável, são vinculados à conta. Não declare “nenhum dado coletado”.

Não há SDK de anúncios, rastreamento entre apps/sites ou publicidade direcionada nesta implementação. Não há login social. Foto e áudio são opcionais. A câmera/biblioteca são usadas apenas se o aluno escolher uma foto; os textos de finalidade estão no Info.plist.

Revise o Privacy Report do Archive antes do envio e responda ao questionário de criptografia com base no binário e nos serviços efetivamente usados. O uso de HTTPS e armazenamento seguro não justifica respostas arbitrárias sobre isenção; o App Store Connect apresenta as perguntas aplicáveis.

## Google: Segurança dos dados

Declare os tipos correspondentes à tabela, finalidades de funcionalidade e gerenciamento de conta e o caráter opcional de foto/áudio. O transporte do app é HTTPS. A exclusão está disponível no app e por solicitação na página web.

A OpenAI processa o conteúdo autorizado para produzir transcrição, voz e feedback. A política de privacidade e o consentimento informam esse envio. Ao responder “compartilhamento”, considere a definição do Google e a exceção aplicável a fornecedores que processam dados em nome do desenvolvedor; não use essa exceção para omitir a coleta ou o fornecedor da política de privacidade.

O app contém geração de conteúdo por IA e permite denunciar respostas sem sair da conversa. A escola precisa acompanhar a fila de denúncias do Django Admin e registrar a resolução.

## Público-alvo e classificação

A escola deve selecionar a faixa de público real e responder aos questionários das lojas. A ausência de conteúdo adulto não significa que o produto foi projetado especificamente para crianças. Se a distribuição incluir crianças ou a categoria infantil, confirme os consentimentos do responsável e as exigências específicas desse público antes de marcar essa opção.

## Texto sugerido para a descrição

**Descrição curta:** Acompanhe suas aulas de inglês e pratique no seu ritmo.

**Descrição:**

Best Part School é o aplicativo para alunos matriculados na escola. Acompanhe suas aulas, consulte materiais, responda atividades e revise seu vocabulário em um só lugar.

Você também pode escolher práticas de conversação, escrita e interpretação com inteligência artificial. O envio de textos, gravações e conteúdo selecionado das aulas à OpenAI depende da sua autorização, que pode ser revogada no perfil. As respostas de IA podem conter erros e contam com um recurso de denúncia.

O acesso requer uma conta de aluno fornecida pela escola. Esta versão não oferece compras ou cobranças dentro do aplicativo.

Referências: [Apple App Privacy](https://developer.apple.com/app-store/app-privacy-details/), [Google Data safety](https://support.google.com/googleplay/android-developer/answer/10787469), [política de dados do Google](https://support.google.com/googleplay/android-developer/answer/10144311), [conteúdo gerado por IA](https://support.google.com/googleplay/android-developer/answer/13985936).
