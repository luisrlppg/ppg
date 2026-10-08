#!/usr/bin/env bash
# PPG ERP — Gestor de despliegue a producción (Docker Compose).
#
# Uso: ./scripts/deploy.sh <update|pull|status|logs|backup|restore|down|help> [tag]
#   update [-b|--build] [tag]  pull + up + espera salud + migraciones
#                     Con `-b`/`--build` construye localmente en vez de descargar.
#                     El `tag` opcional permite desplegar/rollback a una imagen concreta
#                     (por defecto usa PPG_TAG o `latest`).
#   pull              descarga las imágenes del registry (GHCR)
#   status            contenedores + migraciones aplicadas/pendientes
#   logs [servicio]   sigue los logs (todos si se omite el servicio)
#   backup [nombre]   respaldo pg_dump -Fc -> docs/backups/
#   restore [archivo] [--yes]  restaura un respaldo (el más reciente si se omite)
#   down              detiene el stack (conserva el volumen de datos)
#
# Variables de entorno:
#   PPG_ENV_FILE  archivo de entorno (default: .env.production si existe, si no .env).
#   PPG_TAG       tag de las imágenes a desplegar (default: latest).
#   PPG_BUILD=1   construye las imágenes localmente en vez de descargarlas
#                 (equivalente a `update --build`).
#
# Las imágenes las publica CI en GHCR (ghcr.io/luisrlppg/ppg-{api,web,tools}). Si
# los paquetes son privados, haz `docker login ghcr.io -u <usuario> -p <PAT>` una vez.
# El esquema viaja en la imagen y se aplica con `migrate deploy` al arrancar la API.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

ENV_FILE="${PPG_ENV_FILE:-.env.production}"
[ -f "$ENV_FILE" ] || ENV_FILE=".env"
COMPOSE_ENV=()
[ -f "$ENV_FILE" ] && COMPOSE_ENV=(--env-file "$ENV_FILE")

COMPOSE=(docker compose "${COMPOSE_ENV[@]}" --profile full)
BACKUPS_DIR="$ROOT/docs/backups"
PRISMA="node node_modules/prisma/build/index.js"
SCHEMA="node_modules/@ppg/db/prisma/schema.prisma"

log()  { printf '==> %s\n' "$*"; }
warn() { printf 'AVISO: %s\n' "$*" >&2; }

require_docker() {
  command -v docker >/dev/null 2>&1 || { echo "ERROR: docker no disponible." >&2; exit 1; }
  docker compose version >/dev/null 2>&1 || { echo "ERROR: falta el plugin 'docker compose'." >&2; exit 1; }
}

container_id() {
  "${COMPOSE[@]}" ps -q "$1" 2>/dev/null | head -1
}

wait_healthy() {
  local svc="$1" tries="${2:-60}" i id st
  for i in $(seq 1 "$tries"); do
    id=$(container_id "$svc")
    if [ -n "$id" ]; then
      st=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$id" 2>/dev/null || echo "")
      case "$st" in
        healthy|running) echo "  $svc -> $st"; return 0 ;;
      esac
    fi
    sleep 2
  done
  warn "$svc no reportó estado saludable a tiempo."
  return 1
}

migrate_status() {
  log "Estado de migraciones (Prisma)"
  "${COMPOSE[@]}" exec -T api sh -c "$PRISMA migrate status --schema $SCHEMA" || true
}

build_local() {
  export GIT_SHA
  GIT_SHA="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
  export BUILD_TIME
  BUILD_TIME="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  log "Construyendo imágenes localmente (commit $GIT_SHA)"
  "${COMPOSE[@]}" build
}

do_update() {
  require_docker
  local tag="" force_build=0 arg
  for arg in "$@"; do
    case "$arg" in
      -b|--build|build) force_build=1 ;;
      *) tag="$arg" ;;
    esac
  done
  [ -n "$tag" ] && export PPG_TAG="$tag"

  log "Actualizando compose/env (git pull --ff-only)"
  git pull --ff-only || warn "no se pudo hacer git pull; se continúa con la revisión local"

  if [ "$force_build" = "1" ] || [ "${PPG_BUILD:-0}" = "1" ]; then
    build_local
  elif ! "${COMPOSE[@]}" pull api web; then
    warn "Falló 'docker compose pull' (¿login GHCR o tag inexistente?). Construyendo localmente."
    build_local
  fi

  log "Levantando el stack (tag ${PPG_TAG:-latest})"
  "${COMPOSE[@]}" up -d

  log "Esperando servicios"
  wait_healthy api 60 || true
  wait_healthy web 30 || true

  migrate_status
  log "Listo. Entra en http://<host>:${WEB_HOST_PORT:-8090}"
}

do_pull() {
  require_docker
  "${COMPOSE[@]}" pull api web
}

do_status() {
  require_docker
  "${COMPOSE[@]}" ps
  migrate_status
}

do_logs() {
  require_docker
  "${COMPOSE[@]}" logs -f --tail=200 "$@"
}

do_backup() {
  require_docker
  local name="${1:-}" ts file
  ts="$(date +%Y%m%d-%H%M%S)"
  mkdir -p "$BACKUPS_DIR"
  if [ -n "$name" ]; then
    file="$BACKUPS_DIR/ppg-${ts}-${name}.dump"
  else
    file="$BACKUPS_DIR/ppg-${ts}.dump"
  fi
  log "Respaldando la base -> $file"
  "${COMPOSE[@]}" exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$file"
  echo "Punto de retorno creado: $file"
}

do_restore() {
  require_docker
  local file="" assume_yes=0 arg
  for arg in "$@"; do
    case "$arg" in
      --yes|-y) assume_yes=1 ;;
      *) file="$arg" ;;
    esac
  done
  if [ -z "$file" ]; then
    file="$(ls -1t "$BACKUPS_DIR"/*.dump 2>/dev/null | head -1 || true)"
    [ -z "$file" ] && file="$(ls -1t "$BACKUPS_DIR"/*.sql 2>/dev/null | head -1 || true)"
  fi
  if [ -z "$file" ] || [ ! -f "$file" ]; then
    echo "ERROR: no se encontró archivo de respaldo." >&2
    echo "Uso: $0 restore [archivo] [--yes]" >&2
    exit 1
  fi

  local base
  base="$(basename "$file")"
  if [ "$assume_yes" != 1 ]; then
    printf 'Esto SOBRESCRIBE TODA la base de datos con %s. ¿Continuar? [s/N] ' "$base"
    read -r reply
    case "$reply" in
      s|S|si|Si|SI|y|Y) ;;
      *) echo "Cancelado."; return 0 ;;
    esac
  fi

  log "Asegurando PostgreSQL"
  "${COMPOSE[@]}" up -d postgres
  for i in $(seq 1 30); do
    "${COMPOSE[@]}" exec -T postgres pg_isready >/dev/null 2>&1 && break
    sleep 1
  done

  log "Deteniendo api/web para evitar conexiones activas"
  "${COMPOSE[@]}" stop api web 2>/dev/null || true

  log "Respaldando el estado actual (pre-restore)"
  do_backup pre-restore || warn "no se pudo crear el respaldo previo"

  log "Restaurando $base (atómico: DROP SCHEMA + psql --single-transaction)"
  if [[ "$base" == *.dump ]]; then
    "${COMPOSE[@]}" exec -T postgres sh -c '
      set -e
      { echo "DROP SCHEMA IF EXISTS public CASCADE;"; echo "CREATE SCHEMA public;";
        pg_restore --clean --if-exists --no-owner --no-privileges --file - "$1"; } \
      | psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 --single-transaction -f -
    ' _ "/backups/$base"
  else
    "${COMPOSE[@]}" exec -T postgres sh -c '
      set -e
      { echo "DROP SCHEMA IF EXISTS public CASCADE;"; echo "CREATE SCHEMA public;"; cat "$1"; } \
      | psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 --single-transaction -f -
    ' _ "/backups/$base"
  fi

  log "Aplicando migraciones pendientes"
  "${COMPOSE[@]}" run --rm --no-deps api sh -c "$PRISMA migrate deploy --schema $SCHEMA"

  log "Levantando el stack"
  "${COMPOSE[@]}" up -d
  wait_healthy api 60 || true

  log "Restauración completa. Revisa 'deploy.sh status'."
}

do_down() {
  require_docker
  "${COMPOSE[@]}" down
}

usage() {
  sed -n '2,24p' "$0"
}

require_docker
case "${1:-}" in
  update)  shift; do_update "$@" ;;
  pull)    do_pull ;;
  status)  do_status ;;
  logs)    shift; do_logs "$@" ;;
  backup)  do_backup "${2:-}" ;;
  restore) shift; do_restore "$@" ;;
  down)    do_down ;;
  help|-h|--help|"") usage ;;
  *) echo "Acción desconocida: $1" >&2; usage; exit 1 ;;
esac
