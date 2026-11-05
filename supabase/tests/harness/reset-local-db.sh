#!/usr/bin/env bash
# Recrea la base de pruebas local (Postgres sin Supabase) y aplica stub + migraciones.
# Uso: DATABASE_URL=postgresql://postgres@127.0.0.1:54329/postgres supabase/tests/harness/reset-local-db.sh
# NUNCA apunta a un proyecto remoto: rechaza cualquier host que no sea local.
set -euo pipefail
: "${DATABASE_URL:?Define DATABASE_URL (solo local)}"
case "$DATABASE_URL" in
  *@127.0.0.1:*|*@localhost:*|*@\[::1\]:*) ;;
  *) echo "Rechazado: DATABASE_URL no es local" >&2; exit 2 ;;
esac
DIR="$(cd "$(dirname "$0")/../.." && pwd)"
ADMIN_URL="${DATABASE_URL%/*}/postgres"
DB_NAME="${TEST_DB_NAME:-athlete3_test}"
TEST_URL="${DATABASE_URL%/*}/$DB_NAME"
psql "$ADMIN_URL" -v ON_ERROR_STOP=1 -q -c "drop database if exists $DB_NAME with (force);" -c "create database $DB_NAME;"
psql "$TEST_URL" -v ON_ERROR_STOP=1 -q -f "$DIR/tests/harness/supabase_auth_stub.sql"
for f in "$DIR"/migrations/*.sql; do
  psql "$TEST_URL" -v ON_ERROR_STOP=1 -q -f "$f"
done
echo "OK: $TEST_URL"
