#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLIENT_PORT="${CLIENT_PORT:-5179}"
SERVER_PORT="${SERVER_PORT:-8888}"

show_help() {
  cat <<'EOF'
Usage:
  ./run.sh                 Startet Client und Netlify Functions zusammen.
  ./run.sh --client        Startet nur den Vite-Client.
  ./run.sh --server        Startet nur Netlify Functions mit gebautem dist/.
  ./run.sh --client --server
                           Startet Client und Netlify Functions zusammen.

Ports:
  CLIENT_PORT=5179
  SERVER_PORT=8888
EOF
}

start_client=false
start_server=false

if [[ "$#" -eq 0 ]]; then
  start_client=true
  start_server=true
fi

while [[ "$#" -gt 0 ]]; do
  case "$1" in
    --client)
      start_client=true
      ;;
    --server)
      start_server=true
      ;;
    --help|-h)
      show_help
      exit 0
      ;;
    *)
      echo "Unbekanntes Argument: $1" >&2
      show_help >&2
      exit 1
      ;;
  esac
  shift
done

cd "$ROOT_DIR"

if [[ "$start_client" == true && "$start_server" == true ]]; then
  exec npx netlify dev \
    --command "npm run dev -- --host 127.0.0.1 --port ${CLIENT_PORT} --strictPort" \
    --target-port "$CLIENT_PORT" \
    --port "$SERVER_PORT"
fi

if [[ "$start_client" == true ]]; then
  exec npm run dev -- --host 127.0.0.1 --port "$CLIENT_PORT" --strictPort
fi

if [[ "$start_server" == true ]]; then
  npm run build
  exec npx netlify dev \
    --framework "#static" \
    --dir dist \
    --functions netlify/functions \
    --port "$SERVER_PORT"
fi
