#!/bin/bash
# Launcher macOS: instala dependências ausentes, atualiza o build e abre a TUI.
cd "$(dirname "${BASH_SOURCE[0]}")" || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
finish() {
  local result=$1
  read -r -p "Pressione Enter para fechar..." _
  exit "$result"
}
if ! command -v node >/dev/null || ! command -v npm >/dev/null; then
  echo "Instale Node.js 20 ou superior (incluindo npm) e abra novamente."
  finish 1
fi
if ! npm ls --depth=0 >/dev/null 2>&1; then
  npm ci || finish 1
fi
npm run build || finish 1
node dist/apps/cli/main.js
finish $?
