#!/bin/bash
# PPG ERP - Dev Server Manager
# Uso: ./scripts/dev.sh <up|stop|status|logs>

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# --- Load .env ---
load_env() {
  local file="$ROOT/.env"
  if [ ! -f "$file" ]; then return; fi
  while IFS='=' read -r key value; do
    # skip comments and empty lines
    [[ "$key" =~ ^[[:space:]]*# ]] && continue
    [[ -z "$key" ]] && continue
    key=$(echo "$key" | xargs)
    value=$(echo "$value" | sed 's/^["'"'"']//;s/["'"'"']$//' | xargs)
    export "$key=$value"
  done < "$file"
}

load_env

export PNPM_HOME="$HOME/.local/share/pnpm"
export PATH="$PNPM_HOME/bin:$PATH"

DATABASE_URL="${DATABASE_URL:-postgresql://ppg:ppg@localhost:5432/ppg?schema=public}"
JWT_SECRET="${JWT_SECRET:-dev-secret-change-me}"
COOKIE_NAME="${COOKIE_NAME:-ppg_session}"
API_PORT="${API_PORT:-3001}"
WEB_PORT="${WEB_PORT:-3000}"

# --- Helpers ---
pid_on_port() {
  lsof -ti :"$1" 2>/dev/null | head -1 || true
}

# PostgreSQL local reachable? (no docker)
pg_local_ready() {
  local url="$DATABASE_URL"
  local host port user db pass
  host=$(echo "$url" | sed -E 's|postgresql://.*@([^:/]+).*|\1|')
  port=$(echo "$url" | sed -E 's|postgresql://.*@[^:]+:([0-9]+)/.*|\1|')
  user=$(echo "$url" | sed -E 's|postgresql://([^:]+):.*@.*|\1|')
  db=$(echo "$url" | sed -E 's|postgresql://.*/([^?]+).*|\1|')
  pass=$(echo "$url" | sed -E 's|postgresql://[^:]+:([^@]+)@.*|\1|')
  [ -z "$host" ] && host="localhost"
  [ -z "$port" ] && port="5432"
  PGPASSWORD="$pass" pg_isready -h "$host" -p "$port" -U "$user" -d "$db" >/dev/null 2>&1
}

# --- Actions ---
do_up() {
  echo "==> PostgreSQL"
  if pg_local_ready; then
    echo "PostgreSQL local disponible."
  else
    echo "ERROR: PostgreSQL no disponible en $DATABASE_URL"
    echo "Asegurate de que PostgreSQL esté corriendo localmente."
    exit 1
  fi
  local api_dir="$ROOT/apps/api"
  local web_dir="$ROOT/apps/web"

  local api_pid
  api_pid=$(pid_on_port "$API_PORT")
  if [ -n "$api_pid" ]; then
    echo "API ya corriendo en :$API_PORT (pid $api_pid)."
  else
    echo "==> API en :$API_PORT"
    if [ ! -f "$api_dir/dist/main.js" ]; then
      echo "Compilando API..."
      (cd "$api_dir" && pnpm build)
    fi
    DATABASE_URL="$DATABASE_URL" JWT_SECRET="$JWT_SECRET" COOKIE_NAME="$COOKIE_NAME" API_PORT="$API_PORT" \
      nohup node "$api_dir/dist/main.js" > "$ROOT/api.log" 2>&1 &
    echo "API iniciada (pid $!)"
  fi

  local web_pid
  web_pid=$(pid_on_port "$WEB_PORT")
  if [ -n "$web_pid" ]; then
    echo "Web ya corriendo en :$WEB_PORT (pid $web_pid)."
  else
    echo "==> Web en :$WEB_PORT"
    (cd "$web_dir" && nohup npx next dev -p "$WEB_PORT" > "$ROOT/web.log" 2>&1 &) 
    echo "Web iniciada"
  fi
}

do_stop() {
  for port in "$WEB_PORT" "$API_PORT"; do
    local pid
    pid=$(pid_on_port "$port")
    if [ -n "$pid" ]; then
      kill "$pid" 2>/dev/null && echo "Detenido proceso en :$port (pid $pid)." || true
    fi
  done
}

do_status() {
  for port in "$WEB_PORT" "$API_PORT"; do
    local pid
    pid=$(pid_on_port "$port")
    if [ -n "$pid" ]; then
      echo ":${port} -> OK (pid $pid)"
    else
      echo ":${port} -> detenido"
    fi
  done
}

do_logs() {
  echo "=== web.log (ultimas 15) ==="
  [ -f "$ROOT/web.log" ] && tail -15 "$ROOT/web.log" || echo "(vacio)"
  echo ""
  echo "=== api.log (ultimas 15) ==="
  [ -f "$ROOT/api.log" ] && tail -15 "$ROOT/api.log" || echo "(vacio)"
  echo ""
  echo "=== api.err.log ==="
  [ -f "$ROOT/api.err.log" ] && tail -15 "$ROOT/api.err.log" || echo "(vacio)"
}

# --- Main ---
ACTION="${1:-}"
case "$ACTION" in
  up)     do_up ;;
  stop)   do_stop ;;
  status) do_status ;;
  logs)   do_logs ;;
  *)
    echo "Uso: $0 <up|stop|status|logs>"
    exit 1
    ;;
esac
