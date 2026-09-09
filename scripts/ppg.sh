#!/bin/bash
# PPG ERP - Dev Server Manager (un solo comando, alias: ppg)
# Uso: ./scripts/ppg.sh <start|stop|restart|reload|status|logs|db>
#   start    bootstrap completo (postgres + deps + migraciones) y arranca con hot-reload
#   stop     detiene api + web
#   restart  stop + start
#   reload   aplica migraciones pendientes y reinicia los servicios (si corren)
#   status   estado de puertos y de PostgreSQL
#   logs     últimos logs de web/api
#   db       muestra modo+estado de PostgreSQL
#   db <native|docker>   elige el motor de PostgreSQL (persistido en .env) y lo levanta
#   db stop  detiene el motor de PostgreSQL del modo actual
#
# PostgreSQL: PPG_DB_MODE=auto|native|docker (en .env; default auto).
#   auto   usa la URL activa; si no responde prueba cluster nativo y luego Docker.
#   native cluster Linux;  docker `docker compose up -d postgres` (misma DATABASE_URL).

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

if ! command -v pnpm >/dev/null 2>&1; then
  echo "ERROR: pnpm no encontrado (revisa PNPM_HOME)." >&2
  exit 1
fi

DATABASE_URL="${DATABASE_URL:-postgresql://ppg:ppg@localhost:5432/ppg?schema=public}"
DATABASE_URL_DOCKER="${DATABASE_URL_DOCKER:-$DATABASE_URL}"
PPG_DB_MODE="${PPG_DB_MODE:-auto}"
JWT_SECRET="${JWT_SECRET:-dev-secret-change-me}"
COOKIE_NAME="${COOKIE_NAME:-ppg_session}"
API_PORT="${API_PORT:-3001}"
WEB_PORT="${WEB_PORT:-3000}"

# --- Helpers ---
pid_on_port() {
  local pid
  pid=$(lsof -ti :"$1" 2>/dev/null | head -1 || true)
  if [ -z "$pid" ] && command -v ss >/dev/null 2>&1; then
    pid=$(ss -ltnpH "sport = :$1" 2>/dev/null | grep -oP 'pid=\K[0-9]+' | head -1 || true)
  fi
  echo "$pid"
}

# PostgreSQL reachable against a URL? (parse de postgresql://user:pass@host:port/db)
pg_ready_url() {
  local url="$1"
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

pg_local_ready() { pg_ready_url "$DATABASE_URL"; }

# --- PostgreSQL ---
start_native() {
  local version
  version=$(ls /usr/lib/postgresql/ 2>/dev/null | sort -V | tail -1)
  if [ -z "$version" ]; then
    version=$(pg_config --version 2>/dev/null | sed -E 's/.* ([0-9]+).*/\1/' || true)
  fi
  if [ -n "$version" ]; then
    if command -v pg_ctlcluster >/dev/null 2>&1; then
      pg_ctlcluster "$version" main start 2>/dev/null && return 0
    fi
    if command -v service >/dev/null 2>&1; then
      service postgresql start 2>/dev/null && return 0
    fi
  fi
  return 1
}

start_docker_postgres() {
  if ! command -v docker >/dev/null 2>&1; then
    echo "ERROR: docker no disponible. Activa la integracion WSL2 de Docker Desktop." >&2
    exit 1
  fi
  echo "Levantando contenedor postgres (docker compose)..."
  (cd "$ROOT" && docker compose up -d postgres)
  echo "Esperando a que PostgreSQL esté listo..."
  for i in $(seq 1 30); do
    pg_ready_url "$DATABASE_URL_DOCKER" && { echo "PostgreSQL (Docker) listo en $DATABASE_URL_DOCKER."; return 0; }
    sleep 1
  done
  echo "ERROR: PostgreSQL (Docker) no responde en $DATABASE_URL_DOCKER." >&2
  exit 1
}

ensure_postgres() {
  echo "==> PostgreSQL (modo: $PPG_DB_MODE)"
  case "$PPG_DB_MODE" in
    native)
      if pg_local_ready; then
        echo "PostgreSQL disponible ($DATABASE_URL)."
        return 0
      fi
      echo "PostgreSQL no responde, iniciando cluster nativo..."
      if start_native; then
        pg_local_ready && { echo "Cluster PostgreSQL nativo listo."; return 0; }
      fi
      echo "ERROR: no se pudo iniciar el cluster nativo de PostgreSQL en $DATABASE_URL." >&2
      echo "Puede requerir permisos (sudo service postgresql start)." >&2
      exit 1
      ;;
    docker)
      if pg_ready_url "$DATABASE_URL_DOCKER"; then
        echo "PostgreSQL disponible ($DATABASE_URL_DOCKER)."
        return 0
      fi
      start_docker_postgres
      ;;
    auto|*)
      if pg_local_ready; then
        echo "PostgreSQL disponible ($DATABASE_URL)."
        return 0
      fi
      echo "PostgreSQL no responde, intentando cluster nativo..."
      if start_native; then
        pg_local_ready && { echo "Cluster PostgreSQL nativo listo."; return 0; }
      fi
      echo "Cluster nativo no disponible, intentando Docker..."
      if command -v docker >/dev/null 2>&1; then
        start_docker_postgres
      fi
      echo "ERROR: no se pudo iniciar PostgreSQL en $DATABASE_URL." >&2
      echo "Inicialo manualmente (cluster nativo) o activa la integracion WSL2 de Docker Desktop." >&2
      exit 1
      ;;
  esac
}

set_db_mode() {
  local mode="$1"
  if [ "$mode" != "auto" ] && [ "$mode" != "native" ] && [ "$mode" != "docker" ]; then
    echo "ERROR: modo '$mode' invalido (auto|native|docker)." >&2
    return 1
  fi
  local env_file="$ROOT/.env"
  if [ ! -f "$env_file" ]; then
    echo "ERROR: $env_file no existe. Copia .env.example a .env primero." >&2
    return 1
  fi
  if grep -qE '^[[:space:]]*PPG_DB_MODE=' "$env_file"; then
    sed -i -E "s/^[[:space:]]*PPG_DB_MODE=.*/PPG_DB_MODE=$mode/" "$env_file"
  else
    printf '\nPPG_DB_MODE=%s\n' "$mode" >> "$env_file"
  fi
  PPG_DB_MODE="$mode"
}

stop_postgres() {
  case "$PPG_DB_MODE" in
    docker)
      if command -v docker >/dev/null 2>&1; then
        (cd "$ROOT" && docker compose stop postgres) && echo "Contenedor postgres detenido."
      else
        echo "docker no disponible."
      fi
      ;;
    native)
      local version
      version=$(ls /usr/lib/postgresql/ 2>/dev/null | sort -V | tail -1)
      if [ -n "$version" ] && command -v pg_ctlcluster >/dev/null 2>&1; then
        pg_ctlcluster "$version" main stop 2>/dev/null && echo "Cluster PostgreSQL detenido." || echo "No se pudo detener: puede requerir permisos (sudo pg_ctlcluster $version main stop) o el cluster no estaba corriendo."
      else
        echo "No se encontró cluster nativo."
      fi
      ;;
    auto|*)
      echo "Modo auto: usa 'ppg db native stop' o 'ppg db docker stop' para detener el motor."
      ;;
  esac
}

# --- Bootstrap ---
ensure_deps() {
  echo "==> Dependencias"
  if [ -d "$ROOT/node_modules/.pnpm" ]; then
    echo "Ya instaladas (node_modules/.pnpm presente)."
  else
    echo "Instalando dependencias con pnpm..."
    (cd "$ROOT" && pnpm install)
  fi
}

apply_migrations() {
  echo "==> Migraciones"
  (cd "$ROOT" && pnpm db:deploy)
  echo "==> Regenerando Prisma client"
  (cd "$ROOT" && pnpm --filter @ppg/db generate)
}

# --- Actions ---
services_running() {
  [ -n "$(pid_on_port "$API_PORT")" ] || [ -n "$(pid_on_port "$WEB_PORT")" ]
}

do_start() {
  ensure_postgres
  ensure_deps
  apply_migrations

  local api_pid web_pid
  api_pid=$(pid_on_port "$API_PORT")
  if [ -n "$api_pid" ]; then
    echo "API ya corriendo en :$API_PORT (pid $api_pid)."
  else
    echo "==> API (watch, hot-reload) en :$API_PORT"
    (cd "$ROOT/apps/api" && setsid nohup pnpm run dev > "$ROOT/api.log" 2>&1 < /dev/null &)
    echo "API iniciandose (log: api.log)"
  fi

  web_pid=$(pid_on_port "$WEB_PORT")
  if [ -n "$web_pid" ]; then
    echo "Web ya corriendo en :$WEB_PORT (pid $web_pid)."
  else
    echo "==> Web (next dev) en :$WEB_PORT"
    (cd "$ROOT/apps/web" && setsid nohup npx next dev -p "$WEB_PORT" > "$ROOT/web.log" 2>&1 < /dev/null &)
    echo "Web iniciandose (log: web.log)"
  fi

  echo ""
  echo "Abre http://localhost:$WEB_PORT (usuario: admin | clave: admin123)"
}

do_restart() {
  echo "==> Reiniciando servicios"
  do_stop
  do_start
}

do_reload() {
  ensure_postgres
  apply_migrations
  if services_running; then
    echo "==> Servicios corriendo: reiniciando para aplicar cambios"
    do_restart
  else
    echo "No hay servicios corriendo: migraciones aplicadas. Usa 'start' para levantarlos."
  fi
}

do_stop() {
  # kill port listeners
  for port in "$WEB_PORT" "$API_PORT"; do
    local pid
    pid=$(pid_on_port "$port")
    if [ -n "$pid" ]; then
      kill "$pid" 2>/dev/null && echo "Detenido proceso en :$port (pid $pid)." || true
    fi
  done

  # kill watchers/launchers del repo (evita que nest watch vuelva a niños)
  local killed=0
  pkill -f "$ROOT/apps/api.*nest" 2>/dev/null && killed=1 || true
  if [ "$killed" = 1 ]; then
    echo "Detenido watcher de API (nest watch)."
  fi

  # resolver posibles respawns
  sleep 1
  for i in 1 2 3; do
    local any=0
    for port in "$API_PORT" "$WEB_PORT"; do
      local pid
      pid=$(pid_on_port "$port")
      if [ -n "$pid" ]; then
        kill "$pid" 2>/dev/null || true
        any=1
      fi
    done
    [ "$any" = 0 ] && break
    [ "$i" -lt 3 ] && sleep 1
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
  if pg_local_ready; then
    echo "PostgreSQL (modo $PPG_DB_MODE) -> OK"
  else
    echo "PostgreSQL (modo $PPG_DB_MODE) -> detenido"
  fi
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

do_db() {
  local sub="${1:-}"
  case "$sub" in
    "")
      if pg_local_ready; then
        echo "Modo PostgreSQL: $PPG_DB_MODE -> OK ($DATABASE_URL)"
      else
        echo "Modo PostgreSQL: $PPG_DB_MODE -> NO responde"
      fi
      ;;
    native|docker|auto)
      set_db_mode "$sub"
      ensure_postgres
      echo "Modo PostgreSQL persistido en .env: $PPG_DB_MODE"
      ;;
    stop)
      stop_postgres
      ;;
    *)
      echo "Uso: ppg db [native|docker|auto|stop]"
      exit 1
      ;;
  esac
}

# --- Main ---
ACTION="${1:-}"
case "$ACTION" in
  start)   do_start ;;
  stop)    do_stop ;;
  restart) do_restart ;;
  reload)  do_reload ;;
  status)  do_status ;;
  logs)    do_logs ;;
  db)      do_db "${2:-}" ;;
  *)
    echo "Uso: $0 <start|stop|restart|reload|status|logs|db>"
    echo "     ppg db <native|docker|auto|stop>   (motor de PostgreSQL)"
    exit 1
    ;;
esac