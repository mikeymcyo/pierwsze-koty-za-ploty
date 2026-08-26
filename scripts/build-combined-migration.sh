#!/usr/bin/env bash
#
# Regenerates supabase/apply-all-migrations.sql from supabase/migrations/.
#
#   ./scripts/build-combined-migration.sh
#
# That combined file exists purely so a fresh project can be set up with a
# single paste into the Supabase SQL Editor. supabase/migrations/ stays the
# source of truth; rerun this whenever a migration is added or changed.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/supabase/apply-all-migrations.sql"

{
  cat <<'HEADER'
-- ---------------------------------------------------------------------------
-- SiteBoss Pro — every migration, combined into one script.
--
-- GENERATED FILE — DO NOT EDIT.
-- Edit the files in supabase/migrations/ and rerun:
--     ./scripts/build-combined-migration.sh
--
-- HOW TO USE
--   Supabase dashboard -> SQL Editor -> New query -> paste all of this -> Run.
--   Run it once, on a fresh project.
--
--   Afterwards, Table Editor should list ten tables and Storage should show the
--   "site-photos" and "report-pdfs" buckets.
--
-- Requires PostgreSQL 15 or newer. Every Supabase project qualifies.
-- ---------------------------------------------------------------------------
HEADER

  for file in "$ROOT"/supabase/migrations/*.sql; do
    printf '\n\n-- =========================================================================\n'
    printf -- '-- %s\n' "$(basename "$file")"
    printf -- '-- =========================================================================\n\n'
    cat "$file"
  done
} > "$OUT"

echo "Wrote $OUT ($(wc -l < "$OUT") lines)"
