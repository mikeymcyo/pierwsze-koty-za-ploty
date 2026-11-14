#!/usr/bin/env bash
#
# Applies every migration to a throwaway database and runs the schema/RLS tests.
#
#   ./scripts/test-db.sh
#
# Connects using the standard PG* environment variables (PGHOST, PGPORT,
# PGUSER, PGPASSWORD). Requires PostgreSQL 15 or newer.

set -euo pipefail

DB_NAME="${SITEBOSS_TEST_DB:-siteboss_test}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if ! command -v psql >/dev/null 2>&1; then
  echo "psql not found. Install the PostgreSQL client tools first." >&2
  exit 1
fi

echo "==> Recreating database '$DB_NAME'"
psql -q -d postgres -c "DROP DATABASE IF EXISTS $DB_NAME;" >/dev/null
psql -q -d postgres -c "CREATE DATABASE $DB_NAME;" >/dev/null

echo "==> Applying Supabase stubs"
psql -v ON_ERROR_STOP=1 -q -d "$DB_NAME" -f "$ROOT/supabase/tests/00_supabase_stubs.sql"

echo "==> Applying migrations"
for file in "$ROOT"/supabase/migrations/*.sql; do
  echo "    $(basename "$file")"
  psql -v ON_ERROR_STOP=1 -q -d "$DB_NAME" -f "$file"
done

echo "==> Running tests"
for test in "$ROOT"/supabase/tests/0[1-9]*.sql; do
  echo "    $(basename "$test")"
  psql -v ON_ERROR_STOP=1 -q -d "$DB_NAME" -f "$test"
done

echo "==> Dropping database '$DB_NAME'"
psql -q -d postgres -c "DROP DATABASE IF EXISTS $DB_NAME;" >/dev/null
