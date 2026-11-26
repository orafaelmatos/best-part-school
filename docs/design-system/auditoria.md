# Auditoria visual do app do aluno

Data: 26/11/2026. Escopo: telas acessadas pelo aluno no build `student` (App Store e Google Play) e na área do aluno do build web `legacy`. Painel do professor e site ficam fora deste trabalho.

## Telas e onde estão

| Aba | Rota | Arquivo | Linhas |
| --- | --- | --- | --- |
| Início | `/app` | `src/pages/Dashboard.tsx` → `src/components/student/StudentHome.tsx` (+ `WordSentenceComposer`) | 244 |
| Aulas | `/app/aulas` | `src/pages/MinhasAulas.tsx` | 1.028 |
| Estudar | `/app/estudar` | `src/pages/StudentStudy.tsx` | 39 |
| Estudar › Atividades | `/app/homework` | `src/pages/Homework.tsx` (+ `HomeworkPanel`, `HomeworkQuestionMedia`) | 761 |
| Estudar › Vocabulário | `/app/palavras-aprendidas` | `src/pages/PalavrasAprendidas.tsx` (+ `VocabularyDashboard`, `FlashcardReview`) | 42 |
| Estudar › Jogo | `/app/jogo-de-vocabulario` | `src/pages/JogoVocabulario.tsx` | 848 |
| IA › Conversar e escrever | `/app/treinar-ia` | `src/pages/AssistenteIA.tsx` (+ Speaking*, Writing*, `LessonReviewReportCard`) | 1.987 |
| IA › Listening | `/app/interprete-ia` | `src/pages/InterpreteIA.tsx` (+ Interpreter*) | 135 |
| Perfil | `/app/perfil` | `src/pages/StudentProfile.tsx` (+ `StudentPrivacyPanel`) | 62 |
| Login | `/login` | `src/pages/Login.tsx` → `src/components/student/StudentLogin.tsx` | 212 |
| Páginas legais | `/privacidade` etc. | `src/pages/LegalPage.tsx` | 38 |

Shell comum: `src/components/student/StudentLayout.tsx` (cabeçalho, barra de abas, histórico de IA em bottom sheet) e `student.css`.

## Valores fixos no código (antes da fundação)

Contagem nas telas do aluno. "Hex" são cores escritas direto; "raio []" são cantos com valor arbitrário (`rounded-[22px]`); "texto []" são tamanhos de fonte arbitrários.

| Arquivo | Hex | Raio [] | Texto [] | Sombras | Gradientes | `slate-*` |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| JogoVocabulario.tsx | 71 | 25 | 7 | 21 | 5 | 1 |
| AssistenteIA.tsx | 0 | 21 | 19 | 20 | 9 | 55 |
| MinhasAulas.tsx | 0 | 19 | 10 | 9 | 0 | 105 |
| StudentHome.tsx | 22 | 0 | 1 | 1 | 0 | 25 |
| StudentLogin.tsx | 18 | 1 | 4 | 2 | 0 | 8 |
| StudentStudy.tsx | 14 | 0 | 4 | 0 | 0 | 6 |
| StudentProfile.tsx | 10 | 0 | 3 | 0 | 0 | 12 |
| Login.tsx | 0 | 5 | 1 | 8 | 5 | 20 |

Componentes compartilhados com cores fora de tokens (`sky`, `emerald`, `amber`, `violet` etc.): `PastLessonSummary` (19), `FlashcardReview` (13), `WritingActivityCard` (13), `WritingFeedbackCard` (9), `LessonReviewReportCard` (8), `PronunciationFeedback` (6), `StatusBadge` (6), `InterpreterTurnCard` (4).

## Inconsistências encontradas

1. **Três linguagens visuais.** Início, Estudar e Perfil usam verde-azulado e marinho (`#137c78`, `#14243a`). Aulas usa azul-céu, verde e um selo preto. IA usa gradiente azul-verde e cantos de 24 a 32px. O jogo tem paleta própria com 71 cores fixas.
2. **Sem escala de cantos.** Foram encontrados 14, 16, 18, 20, 22, 24, 26, 28, 30 e 32px, além de `rounded-2xl` e `rounded-3xl`.
3. **Sem escala tipográfica.** Títulos de página variam entre 24, 28, 29, 30 e 34px. Há textos de 9 e 10px (selos e rótulos), abaixo do legível.
4. **Rótulos em caixa alta em excesso.** `SEU INGLÊS, TODO DIA`, `MINHAS AULAS`, `PRATICAR COM IA`, `NO SEU RITMO`, com espaçamento de letras largo.
5. **Cards dentro de cards.** Aulas (card de seção com cards de aula dentro) e IA (card grande vazio com o cabeçalho e os modos dentro).
6. **Conteúdo duplicado.** Aulas lista a mesma aula em "Aulas feitas" e em "Trilha do curso". O Início repete em seis atalhos os destinos da barra de abas.
7. **Cabeçalhos diferentes.** O shell mostra um título, e as páginas antigas repetem outro título via `PageHeader`, com o selo "Portal do aluno" escondido no celular.
8. **Textos sem acento.** "Proximas", "Nivel", "expressoes", "revisao", "Nova area".
9. **Espaço vazio.** Na aba IA, um card branco ocupa a tela inteira sem conteúdo abaixo dos três modos.
10. **Logo recriado em texto.** O cabeçalho do Início escreve "best part SCHOOL" ao lado do brasão.
11. **Folha de histórico da IA com cor fixa** (`bg-[#14243a]`), fora de qualquer tema.

## Componentes duplicados ou ausentes

- Cards: `student-card` (CSS), constante `surface` no `StudentHome`, `school-surface` (global) e `Card` do shadcn convivem.
- Cabeçalho de seção: `SectionHeading` existe só no `StudentHome`; as outras telas montam o próprio.
- Estados vazios e de carregamento: cada tela tem o seu (`HomeLoading`, textos soltos, `animate-pulse` avulso).
- Selos de status: `StatusBadge` (staff) e selos avulsos por tela.
- Não existem: Screen Header, List Item, Empty State, Segmented Control, Circular Progress, Chat Bubble e Search Bar padronizados.

## Oportunidades de reutilização

- `Button`, `Input`, `Textarea`, `Dialog`, `Sheet`, `Tabs`, `Progress`, `Skeleton` e `Toast` do shadcn já existem. Com o tema do aluno remapeando as variáveis, eles herdam a paleta sem fork.
- `StudentLayout` já concentra cabeçalho, abas, safe areas e foco. É o lugar do Screen Header e da Bottom Navigation.
- Os cards de Início (próxima aula, atalhos, progresso) viram as variantes Aula, Atividade, Progresso e Continuação.

## O que já estava bom e foi mantido

- Plus Jakarta Sans local (`@fontsource-variable`), já é a fonte pedida.
- Lucide em todo o app.
- Alvos de toque de 44px, safe areas, link "Ir para o conteúdo", `prefers-reduced-motion` e inputs com 16px (sem zoom no iOS).
