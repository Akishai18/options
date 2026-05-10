#!/usr/bin/env bash
# StratLab — spawn API + web together with prefixed log lines.
# Ctrl-C tears both down cleanly.

set -eu

cd "$(dirname "$0")/.."

GREEN="\033[32m"
ORANGE="\033[38;5;214m"
DIM="\033[2m"
RESET="\033[0m"

prefix() {
  local label="$1"
  local color="$2"
  while IFS= read -r line; do
    printf "${color}%-7s${RESET} ${DIM}|${RESET} %s\n" "$label" "$line"
  done
}

# Track child pids so the trap can clean them up.
PIDS=()

cleanup() {
  echo ""
  echo -e "${DIM}stopping api + web…${RESET}"
  for pid in "${PIDS[@]}"; do
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
    fi
  done
  wait 2>/dev/null || true
  exit 0
}
trap cleanup INT TERM

# Quick environment sanity check.
if [ ! -f .env ]; then
  echo -e "${ORANGE}heads up:${RESET} no .env at repo root — copy .env.example and fill in" \
    "STRATLAB_GEMINI_API_KEY before continuing."
fi

if ! command -v uv >/dev/null 2>&1; then
  echo "uv not found — install from https://docs.astral.sh/uv/"
  exit 1
fi
if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm not found — install from https://pnpm.io/"
  exit 1
fi

echo -e "${DIM}starting api (uvicorn) + web (next dev)…${RESET}"

# API on :8000, hot-reloaded.
( uv run uvicorn stratlab_api.main:app --reload --port 8000 2>&1 \
    | prefix "api" "$ORANGE" ) &
PIDS+=($!)

# Web on :3000.
( cd apps/web && pnpm dev 2>&1 | prefix "web" "$GREEN" ) &
PIDS+=($!)

wait
