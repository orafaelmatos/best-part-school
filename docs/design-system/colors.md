# Cores

Valores em `src/design-system/tokens.css` (canais RGB) e `src/design-system/tokens.ts` (hex). Use sempre a classe Tailwind; nunca escreva hex em componentes.

**Distribuição:** cerca de 70% neutros e superfícies claras, 20% tons de azul e 10% destaque e feedback. O azul direciona a atenção: não pinte superfícies inteiras de azul sem motivo.

## Marca

| Token | Hex | Classe | Uso |
| --- | --- | --- | --- |
| Primary | `#2563EB` | `bg-primary`, `text-primary` | Botão principal, ação, item ativo |
| Primary Dark | `#1E40AF` | `primary-dark` | Pressionado, texto sobre `primary-light` |
| Primary Deep | `#172554` | `primary-deep` | Superfícies escuras de destaque (card principal da Home) |
| Primary Medium | `#3B82F6` | `primary-medium` | Gráficos, elementos complementares |
| Primary Soft | `#93C5FD` | `primary-soft` | Ilustrações, indicadores secundários, texto sobre `primary-deep` |
| Primary Light | `#DBEAFE` | `primary-light` | Cards destacados, selecionados, botão secundário |
| Primary Subtle | `#EFF6FF` | `primary-subtle` | Fundos suaves, fundo de ícone, aba ativa |

Texto sobre azul: `text-primary-foreground` (branco).

## Neutros

| Token | Hex | Classe | Uso |
| --- | --- | --- | --- |
| Background | `#F5F8FF` | `bg-canvas` | Fundo das telas |
| Surface | `#FFFFFF` | `bg-surface` | Cards, modais, barra de abas |
| Surface Muted | `#F1F5F9` | `bg-surface-muted` | Superfícies secundárias, trilhas de progresso, segmented control |
| Text Primary | `#111827` | `text-ink` | Títulos e texto principal |
| Text Secondary | `#6B7280` | `text-ink-secondary` | Descrições |
| Text Muted | `#64748B` | `text-ink-muted` | Metadados (data, autor, contagem) |
| Border | `#E5E7EB` | `border-line` | Bordas e divisores |
| Disabled | `#CBD5E1` | `bg-disabled`, `text-disabled` | Controles desabilitados |

## Feedback

| Token | Hex | Classe | Uso |
| --- | --- | --- | --- |
| Success | `#15803D` | `text-success`, `bg-success` | Concluído, resposta certa |
| Success Background | `#DCFCE7` | `bg-success-soft` | Fundo de feedback positivo |
| Warning | `#B45309` | `text-warning` | Aviso, pendente, prazo |
| Warning Background | `#FEF3C7` | `bg-warning-soft` | Fundo de aviso |
| Error | `#DC2626` | `text-danger`, `bg-danger` (ou `destructive`) | Erro, resposta errada |
| Error Background | `#FEE2E2` | `bg-danger-soft` | Fundo de erro |
| Info | `#2563EB` | `text-info` | Informação geral |
| Info Background | `#DBEAFE` | `bg-info-soft` | Fundo informativo |

## IA

| Token | Hex | Classe |
| --- | --- | --- |
| AI Primary | `#4F46E5` | `text-ai`, `bg-ai` |
| AI Background | `#EEF2FF` | `bg-ai-soft` |
| AI Accent | `#818CF8` | `ai-accent` |

Use só em recursos de IA: tutor, sugestões, correções e exercícios gerados. A cor da IA marca origem, não ação: o botão principal continua `bg-primary`. Não use gradientes para IA.

## Contraste (WCAG AA)

Medido com os valores acima. AA exige 4.5:1 para texto normal e 3:1 para texto grande (18px+, ou 14px+ em negrito) e ícones.

| Par | Razão | Situação |
| --- | ---: | --- |
| Branco sobre Primary | 5.17 | OK |
| Branco sobre Primary Deep | 14.69 | OK |
| Primary Dark sobre Primary Light | 7.15 | OK |
| Primary sobre Canvas | 4.86 | OK |
| Ink sobre Canvas | 16.69 | OK |
| Ink Secondary sobre Surface / Canvas | 4.83 / 4.55 | OK |
| Ink Muted sobre Surface | 4.76 | OK |
| Ink Muted sobre Canvas | 4.48 | Só texto grande |
| Ink Muted sobre Surface Muted | 4.34 | Só texto grande |
| Success sobre Success Background | 4.57 | OK |
| Warning sobre Warning Background | 4.51 | OK |
| Error sobre Error Background | 3.95 | Só ícone ou texto grande |
| Error sobre Surface | 4.83 | OK |
| AI sobre AI Background | 5.62 | OK |
| Primary Soft sobre Primary Deep | 8.15 | OK |

| Ink Secondary sobre fundos suaves (`surface-muted`, `primary-subtle`, `ai-soft`, `success-soft`, `warning-soft`) | 4.32 a 4.44 | Só texto grande |
| Ink Secondary sobre Primary Light | 3.96 | Só texto grande |
| Primary sobre fundos suaves | 4.62 a 4.75 | OK |

Regras que saem da tabela:

- `text-ink-secondary` e `text-ink-muted` em texto pequeno só sobre `bg-surface` ou `bg-canvas` (Ink Muted só sobre `bg-surface`). Dentro de blocos com fundo suave (`bg-surface-muted`, `bg-*-soft`, `bg-primary-subtle`, `bg-primary-light`), o texto fica `text-ink` e a hierarquia vem de tamanho e peso.
- Em `bg-danger-soft`, o texto fica `text-ink` e o vermelho vai no ícone e na borda.
- Nunca use cor como único sinal de estado: acompanhe com ícone ou texto ("Concluída", "Atrasada").
