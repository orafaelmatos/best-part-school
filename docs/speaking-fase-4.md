# Speaking com IA — Fase 4

Este incremento conecta a experiência oral à gravação, transcrição, TTS e reprodução existentes. Mantém o motor pedagógico das Fases 1–3, seus contratos e a persistência em `guided_state`/metadados, sem migrações. Não acrescenta relatórios finais ou acompanhamento do professor da Fase 5.

## Interface

O Speaking apresenta as quatro etapas da sessão e permite consultar contexto, papéis e objetivo em uma seção expansível. Os novos cartões distinguem orientação, vocabulário, exemplo, pergunta em inglês, tradução, início de resposta e feedback. Traduções de perguntas ficam acessíveis por uma ação explícita; exemplos e apoio traduzidos continuam disponíveis para A1/A2. O servidor continua responsável pela linguagem pedagógica e pelo nível.

As ajudas da simulação ficam em “Ajudas e opções”, mantendo “Continuar” e “Repetir” acessíveis. Opções administrativas da sessão de Speaking ficam recolhidas. A rolagem e o foco acompanham a atividade atual, sem deixar uma nova pergunta escondida pelas ações abaixo dela. O layout usa os componentes Button/Badge, ícones e tokens de cor, borda e tipografia existentes. Em telas baixas, a página pode rolar para manter a conversa utilizável.

O microfone aparece como interação principal quando a atividade aceita `audio_or_text`. “Responder por texto” abre e foca a alternativa escrita. Atividades de escolha e etapas anteriores à repetição continuam usando as ações apropriadas. Navegadores sem gravação exibem a alternativa textual automaticamente. Mensagens antigas sem os novos metadados conservam a apresentação textual anterior.

## Gravação, processamento e recuperação

O gravador apresenta estados reais: aguardando permissão, gravando, pausado, enviando, processando, concluído e erro. A duração exclui pausas. O formato é negociado com MediaRecorder e enviado com o MIME e a extensão correspondentes, sem declarar WAV para bytes WebM. São aceitos os formatos de áudio já utilizados, parâmetros de codec e alternativas MP4/M4A/OGG dos navegadores. Uploads vazios, tipos incompatíveis e arquivos acima de 25 MB recebem erro com alternativa textual.

Cancelar, mudar de atividade/sessão ou desmontar o componente encerra a captura e libera as faixas do microfone. Uma permissão resolvida depois de cancelar também libera o stream sem enviar áudio. Falhas de permissão, ausência de dispositivo, dispositivo ocupado, inicialização, captura e gravação vazia têm mensagens específicas ou orientação para usar texto.

A gravação permanece disponível para reenviar depois de uma falha de envio/processamento. O cliente envia os campos opcionais `request_id` (UUID estável para a mesma gravação) e `prompt_id` (identidade da atividade). O servidor devolve as mensagens já salvas se o envio anterior tiver sido concluído, evitando outro turno. A identidade da atividade é verificada antes da transcrição e novamente sob bloqueio da sessão antes da avaliação. Uma gravação de outra pergunta é rejeitada; ajudas não alteram essa identidade. Falhas de transcrição/contrato não avançam a atividade. Respostas tardias de outra sessão não alteram a sessão aberta.

O limite de espera do upload é 120 segundos, com distinção entre progresso de envio e processamento. O servidor reutiliza o serviço de transcrição e encaminha o texto ao mesmo motor pedagógico da resposta escrita. Nenhum modelo ou SDK foi substituído.

## Reprodução e contratos aditivos

Palavras, frases, exemplos do professor, perguntas e modelos de resposta usam o TTS/cache existente. “Repetir” mantém o endpoint e as verificações da Fase 3. O novo `POST /api/ai-study/sessions/{id}/utterance-audio/` recebe `{message_id, part}`, onde `part` é `question`, `demonstration` ou `model_answer`. O servidor lê somente campos em inglês de uma mensagem do assistente pertencente à sessão autorizada; texto arbitrário do cliente não é sintetizado.

O botão de vocabulário reutilizado trata geração, carregamento, reprodução, pausa, falha e tempo excedido (30 segundos). Resultados atrasados de outra atividade são ignorados. Uma restrição de reprodução do navegador não provoca regenerações repetidas. O player WaveSurfer existente recebe tratamento de falha de decodificação/reprodução, limite de carregamento de 20 segundos, nova tentativa e limpeza ao trocar de fonte. As falhas de áudio conservam o conteúdo escrito e não consomem turnos.

Metadados opcionais `speaking_turn`, `speaking_help`, `speaking_level`, `speaking_prompt_id` e `assessment_source` permitem a apresentação estruturada. `text`, `guided_action`, as escolhas e os endpoints anteriores continuam compatíveis. O feedback distingue resposta escrita e conteúdo transcrito. A infraestrutura não faz avaliação acústica: não há nota nem inferência de pronúncia a partir de texto/transcrição.

## Arquivos do incremento

- `backend/ai_study/services.py`, `serializers.py`, `views.py`: metadados estruturados, áudio de falas salvas, formatos, retomada de envio e validação da atividade.
- `src/pages/AssistenteIA.tsx`, `src/lib/aiStudy.ts`: integração do compositor oral, alternativa textual, estados, progresso, foco, responsividade e tipos opcionais.
- `src/lib/speakingAudio.ts`, `src/components/MicRecorder.tsx`: compatibilidade, erros e captura real.
- `src/components/AudioPlayer.tsx`, `VocabularyAudioButton.tsx`: reprodução e recuperação de falhas, também preservando os usos anteriores desses componentes.
- `src/components/SpeakingSessionOverview.tsx`, `SpeakingTurnCard.tsx`, `SpeakingVocabularyActivity.tsx`: apresentação das etapas e atividades com o design system existente.
- `backend/ai_study/test_speaking_oral.py`, testes dos componentes de áudio/cartões e `src/pages/AssistenteIA.oral.test.tsx`: validação dos estados, contratos e fallbacks. O teste de simulação existente foi ajustado para expandir a seção de ajudas.
- `scripts/check-speaking-oral.mjs`: verificação local no navegador com APIs controladas e microfone sintético do Chrome.

## Validação

Passaram 126 testes do backend (incluindo regressão das três fases anteriores), 77 testes do frontend, lint dos arquivos alterados, build e verificação de migrações. Os 12 testes orais do backend foram repetidos após o último ajuste de validação de arquivo/duração. A checagem de TypeScript aponta somente os dois erros preexistentes em `src/components/AppSidebar.tsx:609` e `src/pages/Calendario.tsx:632`.

```sh
DATABASE_URL='' DB_ENGINE=django.db.backends.sqlite3 DB_NAME=:memory: OPENAI_API_KEY=test DJANGO_ALLOWED_HOSTS=testserver backend/venv/bin/python backend/manage.py test ai_study.test_speaking_oral ai_study.test_speaking_simulation ai_study.test_speaking_preparation ai_study.test_speaking ai_study.tests --noinput
npm test -- --reporter=dot --maxWorkers=1
npm run build
DATABASE_URL='' DB_ENGINE=django.db.backends.sqlite3 DB_NAME=:memory: OPENAI_API_KEY=test backend/venv/bin/python backend/manage.py makemigrations --check --dry-run
```

Os testes cobrem permissões, duração com pausa, formato nativo/alternativo, cancelamento e limpeza, gravação vazia, envio/processamento, nova tentativa com o mesmo áudio, resposta tardia, idempotência, pergunta obsoleta antes/depois da transcrição, transcrição vazia, áudio indisponível, limites de espera, bloqueio de reprodução, troca de atividade, acesso autorizado, feedback textual/transcrito e continuidade após falha de TTS.

Para reproduzir a verificação visual, iniciar Vite em `127.0.0.1:4173` e executar `node scripts/check-speaking-oral.mjs`. O script passou em 1440×1000, 390×844 e 320×568. Usa Chrome instalado no macOS ou Chromium do Playwright; `SPEAKING_BROWSER_PATH` permite informar outro executável. Todas as APIs são controladas localmente, sem login real, dados de alunos ou chamadas ao provedor. O microfone sintético usa o MediaRecorder real do navegador, gerando WebM/Opus que é enviado e decodificado pelo player. O teste verifica pausa/retomada, avanço para a pergunta seguinte visível, falha de TTS seguida de reprodução, as quatro etapas, ausência de rolagem horizontal e erros de página. Capturas ficam em `/private/tmp/speaking-phase-4` por padrão.

Permanecem para homologação o provedor real, microfones físicos, Safari/Firefox e concorrência em PostgreSQL. Esses limites não são substituídos por resultados simulados nem avaliações acústicas.

## Referências técnicas

O formato de gravação e a liberação de captura seguem as capacidades documentadas de [MediaRecorder.mimeType](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/mimeType), [getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia) e do [evento stop](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/stop_event). Os formatos do serviço de transcrição foram conferidos na [referência oficial da API](https://developers.openai.com/api/reference/python/resources/audio/subresources/transcriptions/methods/create).
