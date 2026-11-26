# Componentes

Todos os componentes consomem tokens e nenhum aceita cor em hex por prop. Importe sempre do índice:

```tsx
import { Button, Card, ListGroup, ListItem, SectionHeader } from "@/components/student/ui";
```

Os arquivos ficam em `src/components/student/ui/`. O shell do aluno está em `src/components/student/` (`StudentLayout`, `BottomNavigation`, `ScreenHeader`).

## Base

### Button

Arquivo `button.tsx`.

| Prop | Valores | Padrão |
| --- | --- | --- |
| `variant` | `primary` (azul, texto branco), `secondary` (azul claro, texto azul escuro), `outline`, `ghost`, `destructive`, `onDark` (branco sobre superfície escura) | `primary` |
| `size` | `sm` (44), `md` (48), `lg` (52), `icon` (48×48) | `md` |
| `fullWidth` | boolean | — |
| `loading` / `loadingLabel` | Mostra o spinner, bloqueia o clique e marca `aria-busy` | — |
| `asChild` | Aplica o estilo a um `Link` filho | — |

```tsx
<Button asChild size="lg" fullWidth><Link to={APP_PATHS.homework}>Continuar atividade</Link></Button>
<Button loading={mutation.isPending} loadingLabel="Enviando…">Enviar</Button>
```

Use uma ação `primary` por tela ou card. As demais ações são `secondary`, `outline` ou `ghost`.

### IconButton

Botão só com ícone, com `aria-label` obrigatório. A variante padrão é `outline`.

```tsx
<IconButton aria-label="Ouvir pronúncia" icon={<Volume2 />} variant="ghost" />
```

### Badge e Chip

Arquivo `badge.tsx`.

- **`Badge`:** status ou contagem, somente leitura. Tons: `neutral`, `primary`, `success`, `warning`, `danger`, `ai`, `solid`. Sempre com texto: "Concluída", "2 pendentes".
- **`Chip`:** filtro selecionável, com `selected` e `aria-pressed`. Use dentro de um grupo com rótulo.

### Avatar

O avatar do aluno fica no `ScreenHeader` e no Perfil (`.student-avatar` e `studentInitials`).

## Estrutura

### Card

Arquivo `card.tsx`. É a mesma estrutura para Aula, Anotação, Atividade, Vocabulário, Progresso, Sugestão de IA, Continuação e Material. Só a superfície muda:

| `variant` | Uso |
| --- | --- |
| `default` | Borda `line` sobre `surface`. É o padrão |
| `raised` | Destaque leve (`shadow-raised`) |
| `muted` | Bloco secundário |
| `highlight` | Item selecionado ou recomendado (`primary-subtle`) |
| `ai` | Conteúdo gerado pela IA (`ai-soft`) |
| `dashed` | Item futuro ou placeholder |

`padding`: `none`, `md` (16) e `lg` (20, o padrão). `interactive`: aplica hover, toque e foco.

Quando o card inteiro navega, use as classes no `Link`:

```tsx
<Link to={path} className={cardVariants({ interactive: true })}>…</Link>
```

Ordem do conteúdo: ícone (`IconTile`), metadado (`text-caption text-ink-muted`), título (`text-body font-medium` ou `text-h4`), descrição (`text-body text-ink-secondary`) e ação.

### IconTile

Ícone sobre um quadrado suave. Tons: `primary` (padrão), `success`, `warning`, `danger`, `ai`, `neutral` e `onDark`. Tamanhos: `sm` (36), `md` (40) e `lg` (48).

### SectionHeader

Título de seção (`text-h4`) com descrição e link "Ver todas" opcionais (`actionLabel` + `actionTo`).

### ListGroup e ListItem

Arquivo `list.tsx`. Use `ListGroup` para agrupar itens em uma superfície só, com divisores. É a alternativa a cards dentro de cards.

`ListItem` recebe:

- `leading`: geralmente um `IconTile`;
- `title`, `description` e `meta`;
- `trailing`: o padrão é uma seta quando o item é navegável;
- `to` (rota interna), `href` ou `onClick`.

A altura mínima é 64.

### Screen e ScreenTitle

Arquivo `screen.tsx`.

- **`Screen`:** aplica 32px entre seções com `flex` + `gap`, que ignora títulos `sr-only` (com `space-y`, um título invisível criaria um vão no topo).
- **`ScreenTitle`:** título da página (`text-h2`), com descrição, linha de apoio e ação opcionais.

O cabeçalho fixo do shell mostra o nome curto da tela. Não repita o mesmo texto no `ScreenTitle`: nele vai uma frase orientada à ação ("O que vamos praticar hoje?").

### SegmentedControl

Arquivo `segmented-control.tsx`. Reúne de 2 a 4 opções exclusivas.

- Com `to` em todos os itens, navega e marca a opção com `aria-current`.
- Sem `to`, troca o estado pelo `onChange` e marca com `aria-pressed`.

## Progresso

Arquivo `progress.tsx`.

- **`ProgressBar`:** recebe `value`, `max` e `label`. O `aria-valuenow` traz a contagem real, não a porcentagem. Tons: `primary`, `success`, `ai` e `onDark`.
- **`CircularProgress`:** recebe `value`, `max`, `label`, `size` e `children`, que ocupam o centro. O padrão no centro é a porcentagem. Use `onDark` sobre `primary-deep`.

## Estados

Arquivo `feedback.tsx`.

- **`Alert`:** tons `info`, `success`, `warning` e `danger`, com título, texto, ação e `role` (`alert` para erro de carregamento). O texto fica sempre `ink`; o tom aparece no ícone e no fundo.
- **`EmptyState`:** recebe ícone, título, descrição e ação. É um convite a agir, nunca um pedido de desculpas. Use `compact` dentro de cards.
- **`Skeleton` e `SkeletonCard`:** placeholders de carregamento. O `SkeletonCard` tem `role="status"` e um rótulo acessível.

## Entrada

Arquivo `text-field.tsx`.

- **`TextField`:** campo com rótulo, `hint`, `error` (que define `aria-invalid` e `aria-describedby`) e `leadingIcon`. A altura é 48.
- **`SearchBar`:** busca com ícone e rótulo invisível.
- **`inputClasses`:** classes para `textarea` e `select` nativos seguirem o mesmo visual.

## Sobreposição

- **`BottomSheet`** (`bottom-sheet.tsx`): painel inferior com alça, título e descrição. Usa o Radix do shadcn, que cuida de foco, Esc e leitor de tela.
- **Modal:** use `Dialog` de `@/components/ui/dialog`. O tema do aluno já aplica cores e cantos.
- **Toast:** use `useToast` ou `sonner`. Os dois seguem o tema.

## IA

Arquivo `chat.tsx`.

- **`ChatBubble`:**
  - `from="student"`: balão azul (`primary`) com texto branco, alinhado à direita.
  - `from="ai"`: superfície neutra com a marca da IA (Sparkles em `ai`).
- **`StudyBlock`:** blocos de `correction`, `translation`, `example` e `tip`, para correções, traduções, exemplos e dicas no chat e nas anotações.
- **`TypingIndicator`:** indicador discreto de que a IA está processando.

## Shell

`src/components/student/`:

- **`StudentLayout`:** cabeçalho fixo, conteúdo, barra de abas e histórico da IA em bottom sheet. Liga o tema do aluno.
- **`ScreenHeader`:** logo e nome na Início; nome da tela nas demais; botão voltar nas conversas; ações e avatar.
- **`BottomNavigation`:** Início, Aulas, IA (botão central azul com Sparkles), Estudar e Perfil. Item ativo em `primary`, inativo em `ink-muted`, fundo branco e safe area. O contador de atividades pendentes aparece em Estudar.

## Componentes de área

Composições reaproveitáveis dentro de uma área. Antes de criar outra parecida, veja se uma destas serve.

| Área | Arquivo | O que oferece |
| --- | --- | --- |
| Aulas | `src/components/student/lessons/LessonProgressSummary.tsx` | Resumo da trilha (`CircularProgress`, contagens) e destaque da próxima aula |
| Aulas | `src/components/student/lessons/LessonList.tsx` | Lista de aulas com status (ícone + texto), detalhe expansível em leitura editorial, palavras, pontos para revisar e materiais |
| Aulas | `src/components/student/lessons/lessonDisplay.ts` | Funções puras: rótulo, ícone e tom do status; formatação de data; filtro de busca sem acento |
| Vocabulário | `src/components/VocabularyAudioButton.tsx` | Áudio de palavra. `iconOnly` mostra só o ícone e usa o rótulo como `aria-label` ("Pausar áudio" durante a reprodução) |
| IA | `src/components/AudioPlayer.tsx` | Player com forma de onda. As cores do WaveSurfer vêm de `colors` em `src/design-system/tokens.ts` |

### Leitura de conteúdo rico

O HTML das anotações do professor é renderizado por `RichTextContent`, compartilhado com o painel de staff. Nas telas do aluno, não altere o componente: estilize pelo contêiner com variantes de filho que usam só tokens (exemplo em `LessonList.tsx`: `text-body-lg leading-7`, `max-w-prose` e títulos, listas e links via `[&_h2]:…`).

## Componentes shadcn

Os componentes de `src/components/ui/` (Dialog, Tabs, Progress, Select, Textarea…) continuam disponíveis. No tema do aluno, eles herdam cores e cantos pelas variáveis remapeadas. Para botões e cards do aluno, prefira os componentes acima.
