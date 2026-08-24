#!/usr/bin/env bash
# Build, then serve the BUILT output on 4327.
#
# Always rebuild first: `astro preview` will happily serve a stale dist and
# send you hunting for CSS bugs that were fixed two builds ago.
set -euo pipefail

if ! command -v node >/dev/null 2>&1; then
  for candidate in "$HOME/.local/node/bin" "/usr/local/bin" "/opt/homebrew/bin"; do
    if [ -x "$candidate/node" ]; then
      PATH="$candidate:$PATH"; export PATH; break
    fi
  done
fi

cd "$(dirname "$0")/.."
npm run build
exec npm run preview -- --port "${PORT:-4327}" --host
