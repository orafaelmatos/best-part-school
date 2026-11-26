# Design system do app do aluno

Identidade visual do app da Best Part School para alunos (build `student`, App Store e Google Play, e área do aluno no web). O painel de professores e o site não usam este tema.

**Princípios:** moderno, minimalista, sofisticado, confortável para longos períodos de estudo, consistente e mobile-first. Azul como cor principal sobre superfícies claras e neutras. Sem visual infantil, sem excesso de cores, gradientes, sombras ou bordas.

## Arquivos

| Documento | Conteúdo |
| --- | --- |
| [colors.md](./colors.md) | Paleta, tokens, classes Tailwind e regras de contraste |
| [typography.md](./typography.md) | Fonte, escala tipográfica e uso |
| [layout.md](./layout.md) | Espaçamento, cantos, elevação, ícones e movimento |
| [components.md](./components.md) | Componentes disponíveis e planejados |
| [guidelines.md](./guidelines.md) | Regras para criar ou alterar telas |
| [auditoria.md](./auditoria.md) | Diagnóstico das telas antes da refatoração |

## Como funciona no código

| Arquivo | Papel |
| --- | --- |
| `src/design-system/tokens.css` | Todos os valores (`--ds-*`): cores em canais RGB, cantos, sombras, layout e movimento |
| `src/design-system/theme.css` | Tema do aluno: com `data-theme="student"` no `<html>`, remapeia as variáveis do shadcn (`--primary`, `--border`, `--radius-*`…) para os tokens |
| `src/design-system/theme.ts` | `useStudentTheme()`: liga o tema no app do aluno (`src/apps/student/App.tsx`) e no `StudentLayout` (build web) |
| `src/design-system/tokens.ts` | Os mesmos valores em TypeScript, para gráficos e código sem CSS. Tamanhos de ícone |
| `tailwind.config.ts` | Classes semânticas (`bg-canvas`, `text-ink-secondary`, `rounded-xl`, `text-h2`, `shadow-raised`…) |

O tema fica no `<html>` e não só no shell. Assim, diálogos, bottom sheets e toasts, que o Radix renderiza fora da árvore, recebem as mesmas cores.

Os cantos `rounded-sm|md|lg|xl|2xl` leem variáveis. No painel de staff, valem os valores anteriores (definidos em `src/index.css`). No tema do aluno, vale a escala deste design system. Por isso, a mesma classe pode ter tamanhos diferentes conforme o app.

## Status da implementação

| Fase | Situação |
| --- | --- |
| 1. Auditoria | Concluída ([auditoria.md](./auditoria.md)) |
| 2. Fundação visual (tokens, tema, tipografia, cantos, elevação) | Concluída |
| 3. Componentes | Concluída (`src/components/student/ui/`) |
| 4. Telas | Concluída: shell, Início, Aulas, Estudar, Atividades, Vocabulário, Jogo de palavras, IA (conversar e escrever), Listening, Perfil, Login, páginas legais e 404 |
| 5. Validação | Concluída: lint, tipos, testes unitários, builds e testes mobile em 360, 390 e 430px |

Fora do tema do aluno, de propósito: painel de staff, site e `PageHeader` (usado pelo staff). Ao criar ou alterar uma tela do aluno, siga [guidelines.md](./guidelines.md).

## Dark mode

Não faz parte do escopo atual. A arquitetura está pronta: um bloco `[data-theme="student"][data-mode="dark"]` redefinindo os `--ds-*` basta, desde que as telas usem só classes semânticas.
