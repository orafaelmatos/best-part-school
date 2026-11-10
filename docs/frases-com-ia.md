# Frases com IA para aluno e professor

## Onde usar

- **Aluno:** no painel inicial e em **Palavras Aprendidas**, o botão **Adicionar uma palavra nova para a IA criar uma frase para você** abre um campo único. O aluno digita uma palavra ou expressão em inglês, recebe uma frase e sua tradução e pode salvá-la para revisar.
- **Professor:** na tela de aulas do aluno, o mesmo formulário cria frases para o aluno selecionado. Nas anotações de uma aula, a seção **Frases com IA** continua aceitando uma palavra ou uma lista, com revisão e aprovação dos cards antes de salvar.

Cada sugestão tem **Refazer mais fácil** e **Refazer mais difícil**. A IA recebe a frase atual, a palavra original e a direção do ajuste. O ajuste muda a construção da frase e atualiza a tradução, sem alterar o nível cadastrado do aluno. Nas listas da aula, somente a sugestão escolhida é substituída; as demais sugestões e suas seleções permanecem.

As instruções e os campos estão em português. O aluno não precisa escrever uma frase ou fornecer uma tradução para começar. Falhas na geração, no ajuste ou no salvamento conservam o conteúdo exibido para tentar novamente.

## Nível e preservação da palavra

O backend usa o nível cadastrado do aluno e não aceita um nível enviado pelo cliente como substituto. Aulas individuais priorizam o nível do aluno; sem nível cadastrado, usam o nível da aula. Aulas em turma usam o nível da aula. Contextos sem referência de nível usam A2. O cadastro antigo **A1/A2** é tratado como A1 para começar com frases simples; os controles permitem enriquecer a construção quando necessário.

Há políticas específicas para A1, A2, B1 e B2, com suporte também a C1 e C2. Foi removida a orientação antiga que mandava usar inglês A2/B1 em contextos de nível geral, independentemente da referência escolhida.

Na geração individual e nas reformulações, a palavra ou expressão original precisa estar presente na frase completa, com limites de palavra. Por exemplo, `ear` não é aceito apenas porque aparece dentro de `learn`. O verificador tolera maiúsculas/minúsculas, espaços e apóstrofos tipográficos. A reformulação também precisa diferir da frase anterior além de pontuação e capitalização. Uma resposta inválida é tentada novamente uma vez; se continuar inválida, a interface conserva a frase anterior.

A geração em lote existente ainda permite sugestões com flexões ou expressões separáveis, marcadas para revisão do professor e inicialmente desmarcadas. A reformulação dessas sugestões preserva a palavra original de forma explícita.

## API e salvamento

Todas as novas ações exigem autenticação.

| Ação | Corpo |
| --- | --- |
| `POST /api/vocabulary-cards/generate-word-sentence/` | `source_word`, `adjustment` (`standard`, `easier`, `harder`), `previous_sentence` quando houver ajuste; `student_id` para professor/administrador. |
| `POST /api/vocabulary-cards/save-word-sentence/` | `source_word`, `sentence`, `translation`; `student_id` para professor/administrador. |
| `POST /api/lessons/{id}/rewrite-word-sentence/` | `source_word`, `previous_sentence`, `adjustment`. Usa o aluno ou a turma da aula e só permite o professor responsável ou administrador. |

Geração e reformulação retornam `{ "item": { "source_word", "sentence", "translation" }, "level" }`. O endpoint de lote continua retornando `items` e agora também informa `level`.

Gerar ou ajustar não publica cards. **Salvar frase para revisar** cria um card com a frase em inglês na frente, tradução em português no verso e a palavra original nas tags e na explicação. O card fica na fila do aluno correto. Não exige áudio para salvar; a revisão usa a geração de áudio existente sob demanda.

O aluno salva apenas no próprio vocabulário. Professores precisam escolher um aluno vinculado por aula ou turma. Campos enviados pelo cliente não podem trocar o proprietário ou o papel do autor. Repetir o salvamento da mesma frase pelo mesmo autor não duplica o card; uma transação com bloqueio do aluno serializa esses salvamentos. As permissões dos cards existentes continuam sendo aplicadas.

Nas anotações, a aprovação em lote mantém o fluxo existente: salva as sugestões aprovadas nos registros de palavras da aula e cria os cards dos alunos vinculados, inclusive turmas. Não são necessárias migrações ou novas variáveis de ambiente.

## Validação

- Backend: `python backend/manage.py test lessons ai_study`, com configuração de testes. Cobertura de níveis, contexto do professor, palavra original, ajuste relativo, falhas do provedor, permissões, salvamento e duplicidade.
- Frontend: `npm test`. Cobertura da apresentação ao iniciante, criação, ajustes sucessivos, conservação da frase em erro, salvamento e resposta tardia ao trocar de aluno.
- Build: `npm run build`.
- Navegador: iniciar Vite em `127.0.0.1:4173` e executar `node scripts/check-word-sentences.mjs`. Verifica painel do aluno, Palavras Aprendidas, tela do professor por aluno e anotações da aula em 1440, 390 e 320 px. Capturas ficam em `/private/tmp/word-sentences` por padrão.

Os testes usam IA simulada; não fazem chamadas pagas ao provedor e não certificam a adequação pedagógica de cada frase real gerada. O backend foi verificado em SQLite em memória. Os dois erros globais de TypeScript já existentes em `AppSidebar.tsx` e `Calendario.tsx` permanecem fora desta alteração.
