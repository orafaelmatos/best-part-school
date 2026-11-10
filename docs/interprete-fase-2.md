# Intérprete IA — Fase 2: interpretação simultânea

A configuração do Intérprete IA oferece **Interpretação simultânea** junto aos modos consecutivo e guiado. O aluno pode escolher falas de aproximadamente 30, 60, 90 ou 120 segundos e velocidade inicial entre 0,6x e 1,25x. A extensão do conteúdo se adapta à duração e o vocabulário/complexidade continuam seguindo o CEFR escolhido.

## Fluxo do aluno

1. Escolher cenário, direção, nível, formato e modo simultâneo.
2. Preparar o áudio original. A duração real aparece quando ele carrega.
3. Usar **Iniciar áudio e gravação**. O microfone começa a gravar e o original toca enquanto o aluno interpreta. O controle não exige uma escuta anterior.
4. Alterar a velocidade durante a reprodução, ou **Pausar os dois** e **Retomar os dois**. A reprodução fica sem controles de avanço/recuo durante a captura para conservar a continuidade da fala.
5. Após o fim do original, concluir a última frase e usar **Concluir simultânea**. Há até 15 segundos para terminar; depois a gravação é concluída automaticamente. Antes do fim do original, é possível cancelar e começar novamente.
6. Revisar original e interpretação juntos, com volumes independentes e controles de pausa e reinício. O aluno pode regravar antes de enviar.
7. Usar **Enviar interpretação** para transcrever e avaliar o significado. O próximo trecho aguarda a resposta e o comando do aluno, como na fase 1.

Use fones para reduzir a captação do áudio original pelo microfone. A gravação usa somente o fluxo do microfone, com cancelamento de eco solicitado ao navegador; não mistura digitalmente o áudio original à resposta.

Durante a captura, os comandos de trocar a forma de resposta, encerrar a sessão e iniciar novo treino ficam desabilitados. Sair pela navegação do aplicativo ou do navegador desmonta o gravador e libera o microfone e a reprodução. Cancelar uma solicitação de permissão também libera qualquer acesso concedido depois do cancelamento. Falhas de reprodução não geram uma resposta vazia. Reenvios conservam a gravação e o identificador da tentativa.

Texto e alternativas permanecem disponíveis como estudo alternativo. Eles não entram na contagem de trechos interpretados oralmente em simultânea.

## Sincronização e revisão

O gravador mantém duas referências: o tempo da gravação, excluindo pausas do gravador, e o tempo do original. Cada intervalo registra início/fim em ambos os relógios e a velocidade utilizada. Atraso inicial, mudanças de velocidade e intervalos de carregamento ficam representados nessa linha do tempo.

Na revisão, a gravação do aluno funciona como relógio principal. O original acompanha a posição/velocidade registrada, pausa nos intervalos sem reprodução e encerra antes da conclusão da frase do aluno quando houver uma cauda de gravação. Uma pequena tolerância de correção compensa diferenças de agendamento do navegador. A reprodução conjunta é uma sincronização de treinamento, não uma medição de latência acústica com precisão de amostra.

Os tempos ficam salvos junto à resposta. O professor pode abrir **Ver falas e gravações**, consultar o histórico e usar o mesmo player de comparação do aluno, inclusive depois de recarregar a sessão. O relatório inclui a quantidade de trechos respondidos por simultânea. Revisões substituem a tentativa considerada no relatório sem duplicar sua contagem.

A direção inglês → português, português → inglês ou alternada segue o mesmo contrato da fase 1. A repetição de um trecho conserva personagem e idiomas. O modo livre considera duração e velocidade ao calcular a quantidade aproximada de falas; sessões curtas podem usar uma fala única com abertura, desenvolvimento e encerramento. Jornadas mantêm cinco etapas.

## API

Na criação da sessão, `interpreter_settings.interpretation_mode` aceita `simultaneous`:

```json
{
  "direction": "alternating",
  "interpretation_mode": "simultaneous",
  "session_style": "free",
  "duration_minutes": 5,
  "segment_duration_seconds": 60,
  "playback_speed": 1,
  "prepare_vocabulary": false,
  "realistic": false
}
```

Os novos campos têm valores padrão de 60 segundos e 1x no modo simultâneo. São desconsiderados nos outros modos. A duração orienta a geração do texto e não corta um áudio no meio: o tempo real varia com o texto, a voz e a velocidade.

`POST /api/ai-study/sessions/{id}/interpreter/answer/` mantém `message_id`, `request_id`, `response_mode: "voice"`, `audio` e `duration_seconds`. Em simultânea, também exige `simultaneous_timing`, como JSON serializado em um campo do multipart:

```json
{
  "version": 1,
  "source_duration_seconds": 10,
  "recording_duration_seconds": 12,
  "source_completed": true,
  "segments": [
    {
      "recording_start_seconds": 0,
      "recording_end_seconds": 4,
      "source_start_seconds": 0,
      "source_end_seconds": 4,
      "playback_rate": 1
    },
    {
      "recording_start_seconds": 4,
      "recording_end_seconds": 12,
      "source_start_seconds": 4,
      "source_end_seconds": 10,
      "playback_rate": 0.75
    }
  ]
}
```

O backend valida números finitos, limites, velocidades, ordem dos intervalos, continuidade do original, consistência entre tempos e velocidade e conclusão da fala. Dados inválidos são recusados antes da transcrição e não avançam a sessão. A linha do tempo é declarada pelo navegador e não comprova a qualidade acústica ou que o aluno falou durante todo o intervalo.

Persistência: `messages[].metadata.interpreter_answer.simultaneous_timing`; contagem no relatório: `guided_state.interpreter.report.simultaneous_segments`. Sessões antigas sem esses campos continuam legíveis. Nenhuma migração, dependência de runtime ou variável de ambiente nova é necessária.

## Avaliação e validação

O feedback continua avaliando fidelidade ao significado, completude e naturalidade do texto transcrito. A sincronização não é usada para inventar notas de fluidez, pronúncia, clareza ou atraso do intérprete. Esses aspectos continuam não avaliados sem análise acústica confiável.

Verificações:

- Backend: `python backend/manage.py test ai_study`, com configuração de testes. Os testes novos cobrem duração/velocidade, orçamento de falas, persistência dos tempos, acesso do professor, reenvios e rejeição de linhas do tempo inválidas.
- Frontend: `npm test`, incluindo os relógios, mudanças de velocidade, pausas, falha de reprodução, permissão cancelada/negada e limpeza ao sair da tela.
- Build: `npm run build`.
- Navegador: iniciar Vite em `127.0.0.1:4173`; executar `node scripts/check-interpreter-simultaneous.mjs` e `node scripts/check-interpreter.mjs`. Os scripts usam Chromium, microfone sintético e APIs simuladas em desktop e telas de 390 e 320 px. O teste de simultânea confirma concorrência real de reprodução/gravação, pausa conjunta, mudança de velocidade em reprodução e em pausa, revisão por aluno/professor e conservação da gravação no reenvio. Capturas e linhas do tempo ficam em `/private/tmp/interpreter-phase-2` por padrão.

Não foram feitas chamadas reais à IA ou validações em microfones/dispositivos físicos. A qualidade do conteúdo gerado e o comportamento acústico precisam ser conferidos com amostras reais. Os testes de backend usam SQLite em memória; não certificam concorrência em PostgreSQL. A checagem global de TypeScript mantém os dois erros preexistentes descritos na fase 1.

Referências dos controles de mídia: [MediaRecorder.pause](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/pause) e [HTMLMediaElement.play](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/play).
