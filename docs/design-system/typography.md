# Tipografia

**Fonte:** Plus Jakarta Sans, variável e empacotada no app (`@fontsource-variable/plus-jakarta-sans`, importada em `src/main.tsx`). Funciona offline. Alternativa, se houver limitação: Inter. Não use outras fontes.

## Escala

Classes definidas em `tailwind.config.ts`. Tamanho, altura de linha e peso já vêm na classe.

| Token | Classe | Tamanho / linha | Peso | Uso |
| --- | --- | --- | --- | --- |
| Display | `text-display` | 36 / 44 | 700 | Números de destaque (progresso), raramente |
| Heading 1 | `text-h1` | 32 / 40 | 700 | Saudação da Home |
| Heading 2 | `text-h2` | 24 / 32 | 700 | Título de tela |
| Heading 3 | `text-h3` | 20 / 28 | 600 | Título do card principal, título de aula |
| Heading 4 | `text-h4` | 18 / 26 | 600 | Título de seção |
| Body Large | `text-body-lg` | 16 / 24 | 400 | Conteúdo de leitura, mensagens de chat |
| Body | `text-body` | 14 / 22 | 400 | Texto padrão de cards e listas |
| Body Medium | `text-body font-medium` | 14 / 22 | 500 | Títulos de itens de lista |
| Caption | `text-caption` | 12 / 18 | 400 | Metadados |
| Label | `text-label` | 12 / 16 | 600 | Rótulos, chips, abas |
| Button | `text-button` | 16 / 24 | 600 | Botões |

Os valores estão em `rem`. Assim, o texto acompanha o tamanho base do sistema e o zoom do navegador.

## Regras

- Conteúdo de estudo (anotações, resumo da aula, correções, chat): `text-body-lg`, altura de linha 24 a 28 (`leading-7` quando o texto for longo).
- Mínimo de 12px. Nada de 9, 10 ou 11px.
- Rótulos em frase normal ("Próxima aula"), não em caixa alta. Caixa alta só em siglas (IA, A2).
- Negrito só em títulos e números. Corpo de texto em 400.
- Não use `tracking-[...]` largo. As classes de título já trazem o espaçamento certo.
- Inglês e português lado a lado: o trecho em inglês leva `lang="en"`. A tradução fica abaixo do original, em `text-ink-secondary` sobre superfície branca, ou em `text-ink` com tamanho menor dentro de blocos com fundo suave (contraste: [colors.md](./colors.md#contraste-wcag-aa)). Veja [guidelines.md](./guidelines.md).
- `cn()` (`src/lib/utils.ts`) conhece a escala acima. Combinar `text-h4` com `text-ink` mantém as duas classes. Se criar um token novo de tamanho, sombra ou curva, registre-o também ali.
