#!/usr/bin/env bash
# Commit all changes and push main to GitHub in one command.
# Usage: ./scripts/sync-github.sh "describe your change"
# One-time setup: git remote add origin https://github.com/<you>/<repo>.git
# Auth: export GITHUB_TOKEN=<token with repo scope>  (or rely on stored git credentials)
set -euo pipefail
cd "$(dirname "$0")/.."

MESSAGE="${1:-Update Terminalflow workspace}"

if ! git remote get-url origin >/dev/null 2>&1; then
  echo "No 'origin' remote configured. Run once:"
  echo "  git remote add origin https://github.com/<you>/<repo>.git"
  exit 1
fi

if [ -n "${GITHUB_TOKEN:-}" ]; then
  ORIGIN_URL="$(git remote get-url origin)"
  if [[ "$ORIGIN_URL" == https://github.com/* ]]; then
    REPO_PATH="${ORIGIN_URL#https://github.com/}"
    git remote set-url origin "https://x-access-token:${GITHUB_TOKEN}@github.com/${REPO_PATH}"
  fi
fi

git add -A
if git diff --cached --quiet; then
  echo "Nothing new to commit."
else
  git commit -m "$MESSAGE"
fi

git push -u origin main
echo "Pushed to $(git remote get-url origin | sed 's/:.*@/:***@/')"
