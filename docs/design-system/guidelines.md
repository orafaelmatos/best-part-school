# Regras para telas do aluno

Vale para pessoas e agentes de IA que criam ou alteram telas do app do aluno.

## Obrigatório

1. **Só tokens.** Cores, cantos, sombras e tipografia vêm das classes em [colors.md](./colors.md), [typography.md](./typography.md) e [layout.md](./layout.md). Proibido: hex, `rgb()` solto, `rounded-[…]`, `text-[…px]`, `shadow-[…]`, `slate-*`, `sky-*`, `emerald-*` e outras paletas do Tailwind em telas do aluno.
2. **Reaproveite componentes.** Antes de criar um card, cabeçalho, selo ou estado vazio, procure em [components.md](./components.md). Se faltar, crie no lugar central e documente. Não crie variações locais.
3. **Mobile primeiro.** Desenhe para 375px; confira em 320, 390, 430 e no iPad. Sem rolagem horizontal, sem texto cortado, sem layout de desktop encolhido.
4. **Um título por tela.** O `ScreenHeader` do shell dá o título. A página não repete outro título igual.
5. **Uma ação principal por tela ou card** (`bg-primary`). As demais são secundárias, outline ou ghost.
6. **Estados completos.** Toda lista ou bloco com dados tem carregamento (skeleton), vazio (com convite à ação), erro (com "Tentar novamente") e conteúdo.
7. **Acessibilidade.** Contraste AA ([colors.md](./colors.md#contraste-wcag-aa)), alvos de 44/48, `aria-label` em botões só com ícone, foco visível, estados com texto ou ícone além da cor, e `prefers-reduced-motion`.

## Composição

- Hierarquia por tamanho, peso, espaço e contraste de superfície, não por cor.
- Evite cards dentro de cards. Para agrupar itens, use uma lista com divisores dentro de um card só.
- Evite gradientes. A única exceção é o card principal da Home, que pode ter um gradiente discreto de `primary-deep` para `primary`.
- Azul com função: ação, item ativo, progresso ou informação. Fundo de ícone em `bg-primary-subtle` com ícone `text-primary`.
- Cor da IA só em recursos de IA.
- Sem visual de jogo infantil: nada de medalhas, confete ou mascote. Gamificação, quando houver, é discreta (progresso, sequência de dias).

## Conteúdo de estudo (anotações, resumos, correções)

- Estrutura editorial: título, subtítulos, parágrafos com `text-body-lg leading-7` e espaço entre blocos. Não transforme cada parágrafo em card.
- Exemplo em inglês com `lang="en"` e tradução logo abaixo (`text-ink-secondary` sobre branco; `text-ink` dentro de blocos suaves).
- Blocos de destaque (regra, dica, atenção) com fundo suave (`bg-primary-subtle`, `bg-warning-soft`) e canto `rounded-lg`, sem borda grossa.
- Correção: o texto errado e o certo aparecem lado a lado, cada um com ícone e rótulo, não só com a cor.

## Texto da interface

- pt-BR, falando com o aluno por "você". Frases curtas, com acentuação correta.
- Rótulos em frase normal, não em caixa alta.
- Botões com verbo: "Ver aula", "Continuar atividade", "Praticar com IA".
- Erro: diga o que aconteceu e o que fazer ("Não carregamos suas aulas. Tente novamente.").

## Antes de concluir

```bash
npm run lint
npm run check:types
npm test
npm run build:student
```

Para mudanças visuais, gere capturas em 390px (veja `docs/screenshots/README.md`) e atualize o status em [README.md](./README.md).
