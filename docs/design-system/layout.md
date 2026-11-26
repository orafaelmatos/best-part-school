# Layout, cantos, elevação, ícones e movimento

## Espaçamento

Base de 4px. Use a escala padrão do Tailwind, que já é múltipla de 4.

| Token | px | Tailwind |
| --- | ---: | --- |
| spacing-xs | 4 | `1` |
| spacing-sm | 8 | `2` |
| spacing-md | 12 | `3` |
| spacing-lg | 16 | `4` |
| spacing-xl | 24 | `6` |
| spacing-2xl | 32 | `8` |
| spacing-3xl | 40 | `10` |
| spacing-4xl | 48 | `12` |
| spacing-5xl | 64 | `16` |

Fora da tabela, só 20px (`5`) é permitido: margem lateral e padding de cards. Evite valores como `7` (28), `9` (36) e `[Npx]`.

| Situação | Valor |
| --- | --- |
| Margem lateral das telas | 20 (`px-gutter`, já aplicada por `.student-main`) |
| Entre seções | 24 a 32 (`space-y-6`, `space-y-8`) |
| Entre cards | 12 a 16 (`gap-3`, `gap-4`) |
| Padding interno de card | 16 a 20 (`p-4`, `p-5`) |
| Entre elementos relacionados | 8 a 12 (`gap-2`, `gap-3`) |

## Cantos

No tema do aluno, as classes padrão seguem esta escala (`src/design-system/theme.css`):

| Token | px | Classe | Uso |
| --- | ---: | --- | --- |
| Radius XS | 6 | `rounded-xs` | Elementos pequenos |
| Radius SM | 8 | `rounded-sm` | Tags, itens auxiliares, ícone da aba ativa |
| Radius MD | 12 | `rounded-md` | Inputs, botões secundários, fundo de ícone |
| Radius LG | 16 | `rounded-lg` | Botões, cards |
| Radius XL | 20 | `rounded-xl` | Cards principais |
| Radius 2XL | 24 | `rounded-2xl` | Modais e bottom sheets |
| Radius Full | 9999 | `rounded-full` | Avatares, chips, elementos circulares |

Não use `rounded-3xl` nem `rounded-[Npx]`.

## Elevação

| Nível | Classe | Uso |
| --- | --- | --- |
| 0 | `border border-line` ou contraste `bg-surface` sobre `bg-canvas` | Padrão. A maioria dos cards |
| 1 | `shadow-raised` | Card em destaque, controle selecionado, barra flutuante |
| 2 | `shadow-overlay` | Modais, menus, bottom sheets |

Hierarquia vem primeiro de espaço e contraste de superfície. Não combine borda e sombra no mesmo card sem necessidade.

## Ícones

Lucide (`lucide-react`), outline. Tamanhos em `src/design-system/tokens.ts`:

| Uso | px | Constante |
| --- | ---: | --- |
| Pequeno (dentro de texto, chip) | 16 | `iconSize.sm` |
| Padrão (lista, botão) | 20 | `iconSize.md` |
| Principal (aba, cabeçalho) | 24 | `iconSize.lg` |
| Destaque (estado vazio, card principal) | 28 a 32 | `iconSize.xl` |

Espessura: `strokeWidth={1.75}` (`iconStroke`); 2 no item ativo. Ícone decorativo leva `aria-hidden`. Botão só com ícone leva `aria-label`. Sem emoji.

## Movimento

| Token | Valor | Tailwind |
| --- | --- | --- |
| Rápido | 150ms | `duration-150` |
| Base | 200ms | `duration-200` |
| Lento | 300ms | `duration-300` |
| Curva | `cubic-bezier(0.2, 0, 0, 1)` | `ease-standard` |

Use para pressionar (`active:scale-[0.98]`), abrir sheets, expandir, preencher progresso e skeleton. O shell já desliga animações com `prefers-reduced-motion`. Animação nunca atrasa uma ação.

## Toque e áreas seguras

- Alvo mínimo de 44×44 (iOS) e 48×48 (Android). Botões principais com 48 a 52 de altura.
- Cabeçalho e barra de abas já respeitam `env(safe-area-inset-*)`. Elementos fixos novos também devem respeitar.
- Inputs com no mínimo 16px de fonte, para o iOS não aplicar zoom.
