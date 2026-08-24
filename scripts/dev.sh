#!/usr/bin/env bash
# Start the Astro dev server.
#
# Node is not on the default PATH on the primary dev box (it lives under
# ~/.local/node), so find it before giving up.
set -euo pipefail

if ! command -v node >/dev/null 2>&1; then
  for candidate in "$HOME/.local/node/bin" "/usr/local/bin" "/opt/homebrew/bin"; do
    if [ -x "$candidate/node" ]; then
      PATH="$candidate:$PATH"; export PATH; break
    fi
  done
fi

if ! command -v node >/dev/null 2>&1; then
  echo "node not found on PATH" >&2; exit 1
fi

cd "$(dirname "$0")/.."
exec npm run dev -- "$@"
