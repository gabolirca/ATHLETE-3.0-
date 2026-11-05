#!/usr/bin/env bash
# Postgres 16 desechable para las pruebas de base de datos e integración. SOLO local (127.0.0.1), nunca remoto.
#
#   supabase/tests/harness/local-postgres.sh start   # crea el clúster si no existe y lo arranca en 127.0.0.1:54329
#   supabase/tests/harness/local-postgres.sh status
#   supabase/tests/harness/local-postgres.sh stop
#
# Datos en $ATHLETE_PGDATA (por defecto .pgdata/ en la raíz, ignorado por git). Este script nunca borra el clúster.
# Después de `start`:  DATABASE_URL=postgresql://postgres@127.0.0.1:54329/postgres npm run test:db
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
PGDATA="${ATHLETE_PGDATA:-$ROOT/.pgdata}"
PORT="${ATHLETE_PGPORT:-54329}"
BIN="${PG_BIN:-/opt/homebrew/opt/postgresql@16/bin}"
export PATH="$BIN:$PATH"

command -v pg_ctl >/dev/null || { echo "No se encontró pg_ctl (instalar: brew install postgresql@16 o definir PG_BIN)" >&2; exit 2; }

case "${1:-}" in
  start)
    if [ ! -f "$PGDATA/PG_VERSION" ]; then
      initdb -D "$PGDATA" -U postgres --auth=trust -E UTF8 --no-locale >/dev/null
      echo "Clúster creado en $PGDATA"
    fi
    if pg_ctl -D "$PGDATA" status >/dev/null 2>&1; then
      echo "Ya estaba en marcha"
    else
      # Solo TCP en loopback: rutas de socket largas fallan en macOS y no hace falta exponer nada más.
      pg_ctl -D "$PGDATA" -o "-p $PORT -c listen_addresses=127.0.0.1 -c unix_socket_directories=''" -l "$PGDATA.log" -w start >/dev/null
    fi
    pg_isready -h 127.0.0.1 -p "$PORT"
    echo "DATABASE_URL=postgresql://postgres@127.0.0.1:$PORT/postgres"
    ;;
  status) pg_ctl -D "$PGDATA" status ;;
  stop) pg_ctl -D "$PGDATA" -w stop ;;
  *) echo "Uso: $0 start|status|stop" >&2; exit 2 ;;
esac
