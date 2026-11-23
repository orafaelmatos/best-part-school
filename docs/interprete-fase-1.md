# Intérprete IA — Fase 1

O Intérprete IA agora inicia sessões de interpretação oral, com personagens e continuidade de um evento. A interface usa voz como resposta principal; texto e alternativas no idioma de destino continuam disponíveis. Sessões antigas de listening abrem na interface anterior.

## Entregue

- Direções inglês → português, português → inglês e alternância entre dois personagens. A direção é definida na criação e aplicada a cada trecho; revisões conservam os idiomas do trecho original.
- Interpretação consecutiva e treinamento guiado. A próxima fala só é criada depois da resposta e mediante o comando **Próxima fala**, independentemente da nota. Pedidos repetidos de próxima fala não pulam um trecho pendente.
- Cenários de pregação, restaurante, aeroporto, hotel, reunião, entrevista, turismo, consulta, eventos e contexto personalizado. O plano tem uma situação concreta, dois personagens e cinco etapas coerentes. A geração recebe as falas anteriores e uma indicação explícita de encerramento.
- Jornada de cinco etapas ou interpretação livre, com duração aproximada de 2 a 15 minutos. O formato livre usa um orçamento de trechos baseado na duração e no nível e oculta os nomes das etapas durante a simulação. O tempo depende do ritmo do aluno, sem cronômetro forçado.
- Conteúdo, extensão dos trechos, velocidade inicial do áudio e ajudas adaptados ao CEFR A1–C2. O modo **Simulação real** oculta transcrição e dicas até a resposta.
- Preparação opcional de vocabulário com expressão em inglês, tradução, exemplo contextualizado, tradução do exemplo e áudio da expressão e do exemplo. Pode ser pulada.
- Gravação com pausa, retomada e cancelamento, reprodução local antes do envio e reprodução da gravação persistida. A reprodução original é interrompida/bloqueada durante a gravação consecutiva. O aluno precisa terminar a escuta ou consultar a transcrição para responder.
- Controles nativos de reprodução e pausa, repetição e velocidade. Original, vocabulário e sugestão usam TTS com instrução explícita de idioma; português usa português brasileiro. Áudios são gerados sob demanda, com cache e opção de tentar novamente.
- Feedback em português sobre fidelidade, completude e naturalidade, aceitando paráfrases. A avaliação considera unidades de informação da fala original e exige evidências reais da resposta. O relatório distingue informações preservadas, omitidas e alteradas.
- Relatório persistido, encerramento antecipado, revisão de trechos difíceis e histórico de todas as tentativas. A revisão atualiza o resultado do trecho sem duplicar sua contagem ou avançar a sequência principal. A tentativa mais recente compõe o relatório.
- Acompanhamento do professor em **Aulas do aluno → Intérprete IA**, com o mesmo relatório, acesso às falas e às gravações. Professores vinculados consultam as práticas de seus alunos sem respondê-las, encerrá-las ou excluí-las. Também podem praticar em sessões próprias.

## Avaliação e limites desta fase

O fluxo de áudio existente fornece uma transcrição, sem análise acústica confiável. Por isso, fluidez, pronúncia e clareza da fala ficam explicitamente **não avaliadas**, sem notas inventadas. Naturalidade é avaliada no texto/transcrição, e não como qualidade acústica. Respostas com alternativas avaliam reconhecimento de significado e não recebem nota de naturalidade produzida pelo aluno.

O modelo avalia significado; não há comparação literal de strings para decidir se uma interpretação está correta. O servidor valida a estrutura, a direção declarada, as referências de informações e os trechos citados como evidências. Isso não substitui uma revisão pedagógica de amostras reais do conteúdo e do feedback gerados pela IA.

A fase 1 entregou os modos `consecutive` e `guided`. A **interpretação simultânea foi adicionada na [Fase 2](interprete-fase-2.md)**, com reprodução e gravação concorrentes, controle de duração/velocidade, sincronização e revisão dos dois áudios.

## API e persistência

`POST /api/ai-study/sessions/` recebe `mode: "listening"`, `scenario_key`, `scenario_label`, `level` e `interpreter_settings`:

```json
{
  "direction": "en_pt",
  "interpretation_mode": "consecutive",
  "session_style": "journey",
  "duration_minutes": 5,
  "prepare_vocabulary": false,
  "realistic": false
}
```

As ações sob `/api/ai-study/sessions/{id}/interpreter/` são:

| Ação POST | Corpo |
| --- | --- |
| `next/` | Sem corpo. Inicia a primeira fala após preparação ou continua depois da resposta. |
| `answer/` | `message_id`, `request_id` UUID, `response_mode` (`voice`, `text`, `multiple_choice`) e `audio` multipart, `answer_text` ou `selected_option_index`. Gravações podem informar `duration_seconds`. |
| `audio/` | `part`: `original`/`suggested` com `message_id`; `vocabulary`/`example` com `vocabulary_index`. Retorna `audio_url`. |
| `retry/` | `message_id` de um trecho já respondido. |
| `finish/` | Sem corpo. Encerramento idempotente e relatório. |

As ações retornam o detalhe atualizado da sessão, exceto `audio/`. O relatório fica em `guided_state.interpreter.report`, o plano e as configurações em `guided_state.interpreter`, e as falas/avaliações em metadados versionados das mensagens. Gravações reutilizam `SpeakingAudio`. Não são necessárias migrações ou novas variáveis de ambiente; usa as credenciais existentes do backend.

Transações e bloqueio da sessão protegem o fluxo. `request_id` evita processamento e evidências duplicados no reenvio de uma resposta. Respostas a trechos obsoletos, uploads inválidos e contratos de IA inválidos não avançam a sessão. Uma falha na criação reverte a sessão incompleta.

`GET /api/ai-study/sessions/?modes=listening&student={uuid}` disponibiliza o relatório ao professor conforme os vínculos existentes. O filtro não amplia as permissões de acesso.

## Validação

- Testes de backend: `python backend/manage.py test ai_study` com ambiente de testes configurado. Os testes novos estão em `backend/ai_study/test_interpreter.py` e usam provedor simulado.
- Testes de frontend: `npm test`; build: `npm run build`.
- Navegador: iniciar Vite em `127.0.0.1:4173` e executar `node scripts/check-interpreter.mjs`. Usa Chromium, microfone sintético e APIs simuladas; verifica configuração, vocabulário, gravação WebM real do navegador, reprodução antes/depois do envio, feedback, relatório persistido e visualização do professor em 1440, 390 e 320 px. Capturas são salvas em `/private/tmp/interpreter-phase-1` por padrão.
- A validação não faz chamadas reais ao provedor e não certifica qualidade pedagógica ou acústica em dispositivos físicos. O backend foi testado com SQLite em memória; bloqueios concorrentes devem também ser exercitados em PostgreSQL antes da publicação.
- A checagem global de TypeScript já apresentava erros em `AppSidebar.tsx` (propriedade `description`) e `Calendario.tsx` (comparação de papéis). Esses arquivos não foram alterados nesta entrega.

Integração baseada na documentação oficial da OpenAI para [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs) e [transcrição de áudio](https://developers.openai.com/api/docs/guides/speech-to-text), reutilizando os clientes existentes no projeto.
