# Feedback curto após áudio de Speaking

O upload continua usando o motor pedagógico existente para responder à situação. Agora uma análise separada gera um cartão curto, em português por padrão, antes da próxima fala do personagem. As gravações originais continuam salvas em `SpeakingAudio`, sem transformação.

O cartão apresenta a transcrição e o áudio original, a frase de estudo e sua tradução consultável, até três comentários, uma explicação da mudança e a opção de repetir. Gramática, naturalidade e pronúncia ficam separadas em “Ver mais detalhes”. O relatório agregado de fim de situação também fica recolhido quando acompanha esse cartão.

## Texto e áudio

`speaking_feedback.sentence()` escolhe uma única frase para a tela e o TTS. Para registros anteriores, respeita a mesma prioridade da interface: `natural_sentence`, `native_alternative_sentence`, `corrected_sentence`. Para registros novos, usa `raw_response.suggested_sentence`.

`POST /api/ai-study/feedback/{id}/tts/` retorna `audio_url` e `text`. A interface verifica se `text` corresponde à frase exibida antes de apresentar o áudio. O cache usa a frase exata; URLs antigas sem identificação do texto não são reutilizadas. O TTS recebe somente o texto salvo e a instrução de lê-lo sem modificar palavras. O player permite ouvir novamente, sem novas chamadas, e escolher 0,75x ou 1x.

O mesmo endpoint aceita `chunk_index` para um trecho ou `full_sentence: true` para a frase completa. O servidor seleciona o texto, sem aceitar frases arbitrárias do cliente. Os trechos são partes contíguas da frase salva, com até seis palavras, e sua junção preserva a frase completa.

## Análise e honestidade

`OralFeedback` define resumo, tradução, até três comentários e três mudanças verificáveis. Cada mudança precisa citar um trecho real da transcrição e um trecho real da sugestão. Uma alternativa de naturalidade não pode ser classificada como erro gramatical. Frases já corretas e naturais são preservadas. Em caso de intenção ambígua, a análise pede esclarecimento e não avança a simulação nem oferece uma reformulação inventada.

**Ainda não existe avaliador acústico.** A entrada do avaliador é a transcrição. O cartão informa “Pronúncia não avaliada”, sem notas ou afirmações sobre sons, tonicidade, ritmo ou entonação. A comparação de tentativas considera somente evidências textuais de construção e escolha de palavras. Os campos antigos de notas retornam `null`; as notas acústicas antigas inferidas de texto não são reapresentadas como evidência.

Os prompts pedem português brasileiro nas explicações de todos os níveis e traduções consultáveis das frases de estudo. Alunos B2, C1 e C2 podem escolher inglês no seletor do compositor; A1–B1 permanecem em português. A preferência se aplica à próxima gravação e não altera as frases da simulação.

Se o provedor não conseguir analisar, a gravação e a continuação da conversa são preservadas. O cartão avisa a indisponibilidade, não atribui avaliações e permite praticar a própria transcrição. Falhas de TTS permitem tentar novamente ou continuar pelo texto.

## Repetição e retorno à conversa

O endpoint de upload aceita os campos aditivos:

- `retry_feedback_id`: feedback mais recente da mesma sessão.
- `chunk_index`: índice opcional de um trecho da frase completa.
- `feedback_language`: `pt-BR` (padrão) ou `en` nos níveis avançados.

Sem `retry_feedback_id`, o áudio responde à pergunta da situação. Com esse campo, a nova gravação é uma atividade de repetição: não consome a pergunta pendente, não muda a fase/etapa, não adiciona evidência ao relatório agregado e mantém a próxima fala do personagem. A nova análise aponta a tentativa anterior e pode comparar mudanças reais; comparações entre alvos diferentes são omitidas. Depois de praticar um trecho, a frase completa continua disponível para ouvir e repetir.

A referência é revalidada depois da transcrição, dentro da transação. Feedbacks de outra sessão ou de uma pergunta que já mudou são rejeitados. `request_id` continua garantindo que reenviar uma mesma gravação não duplique mensagens, análises ou relatórios.

“Continuar conversa” sai do modo de repetição. “Próxima situação”, quando oferecida pelo motor, usa a ação existente de novo desafio. Nenhum desses controles demonstra domínio automaticamente.

## Persistência e validação

Não há migração: o contrato novo fica no JSON `raw_response` de `SpeakingFeedback`; o serializer o expõe em `learning_feedback`. Mensagens antigas e endpoints anteriores continuam disponíveis.

Testes de contrato e API cobrem alternativas válidas, evidência das mudanças, esclarecimento, gravação original, TTS/cache legado, divisão em trechos, repetição sem avanço, idioma, falhas e idempotência. Testes React verificam fontes independentes dos players, texto correspondente, velocidade, repetição, tradução, detalhes recolhidos e envio explícito do alvo pelo compositor.

Para verificar o navegador com APIs simuladas e microfone sintético:

```sh
npm run dev -- --host 127.0.0.1 --port 4173
node scripts/check-speaking-feedback.mjs
```

O script verifica 1440×1000, 390×844 e 320×568, incluindo geração/repetição de áudio, velocidade, prática por partes, gravação real do MediaRecorder, retorno à pergunta pendente e ausência de overflow/erros de página. Capturas ficam em `/private/tmp/speaking-feedback` por padrão. Nenhum áudio de aluno, login real ou chamada ao provedor é utilizado nos testes.

Nesta entrega passaram os 150 testes de `ai_study`, os 89 testes de frontend, o build de produção e o script de navegador. A checagem TypeScript geral ainda aponta os dois erros anteriores em `AppSidebar.tsx:609` e `Calendario.tsx:632`, arquivos não alterados nesta entrega.
