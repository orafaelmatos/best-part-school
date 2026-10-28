#!/usr/bin/env bash
set -euo pipefail

usage() {
  printf 'Uso: bash scripts/new-feature.sh <feat|fix|chore>/<nome>\n' >&2
  printf 'Exemplo: bash scripts/new-feature.sh feat/relatorio-financeiro\n' >&2
  exit 1
}

[[ $# -eq 1 ]] || usage
branch=$1
[[ "$branch" =~ ^(feat|fix|chore)/[a-z0-9]+(-[a-z0-9]+)*$ ]] || usage

git rev-parse --git-dir >/dev/null
git check-ref-format --branch "$branch" >/dev/null

# All worktrees share this directory, even when called from another worktree.
common_dir=$(cd "$(git rev-parse --git-common-dir)" && pwd -P)
repo_dir=$(dirname "$common_dir")
workspace="$repo_dir/.worktrees/$branch"

if git show-ref --verify --quiet "refs/heads/$branch"; then
  printf 'A branch %s já existe. Escolha outro nome ou retome seu worktree.\n' "$branch" >&2
  exit 1
fi
if [[ -e "$workspace" || -L "$workspace" ]]; then
  printf 'A pasta %s já existe. Nenhum arquivo foi alterado.\n' "$workspace" >&2
  exit 1
fi

# A failed fetch stops here: never silently start a production feature on stale code.
git fetch origin
git show-ref --verify --quiet refs/remotes/origin/main
git worktree add --no-track -b "$branch" "$workspace" origin/main

printf '\nFeature criada a partir de origin/main: %s\n' "$branch"
printf 'Pasta: %s\n' "$workspace"
printf 'Próximos comandos:\n  cd %q\n  npm ci\n  npm run dev -- --port 8083\n' "$workspace"
printf 'Depois de implementar e validar: git push -u origin %q\n' "$branch"
printf 'Abra um pull request dessa branch para main.\n'
