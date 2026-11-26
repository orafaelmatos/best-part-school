# Best Part School — instruções para agentes

Leia o [README](README.md) para a estrutura do projeto (Vite/React + Django, builds `legacy`, `site`, `admin` e `student`, app mobile com Capacitor).

## Interface do aluno

Toda tela ou componente usado pelo aluno (build `student` e área do aluno no web) segue o design system em [docs/design-system/](docs/design-system/README.md):

- Leia [guidelines.md](docs/design-system/guidelines.md) antes de criar ou alterar telas.
- Use só os tokens e classes de [colors.md](docs/design-system/colors.md), [typography.md](docs/design-system/typography.md) e [layout.md](docs/design-system/layout.md). Sem hex, `rounded-[…]`, `text-[…px]` ou paletas do Tailwind (`slate-*`, `sky-*`…) nessas telas.
- Reaproveite os componentes de [components.md](docs/design-system/components.md). Componente novo vai para o lugar central e é documentado.
- Os valores ficam em `src/design-system/tokens.css`. Para mudar uma cor, edite o token e a documentação juntos.

O painel de staff e o site não usam esse tema.

## Validação

```bash
npm run lint
npm run check:types
npm test
npm run build:student
```
