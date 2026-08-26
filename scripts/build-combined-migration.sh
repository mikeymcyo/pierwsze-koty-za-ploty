#!/usr/bin/env bash
#
# Regenerates supabase/apply-all-migrations.sql from supabase/migrations/.
#
#   ./scripts/build-combined-migration.sh
#
# That combined file exists purely so a fresh project can be set up with a
# single paste into the Supabase SQL Editor. supabase/migrations/ stays the
# source of truth; rerun this whenever a migration is added or changed.
#
# The output is strict, raw PostgreSQL: pure 7-bit ASCII, every non-SQL line a
# "--" comment, no Markdown of any kind. The checks at the bottom enforce that
# and fail the build rather than emit a file the SQL Editor would choke on.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/supabase/apply-all-migrations.sql"

{
  cat <<'HEADER'
-- ---------------------------------------------------------------------------
-- SiteBoss Pro - every migration, combined into one script.
--
-- GENERATED FILE - DO NOT EDIT.
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

# --------------------------------------------------------------------------
# Validation. Any failure here means the file must not be handed to anyone.
# --------------------------------------------------------------------------

fail() {
  echo "ERROR: $1" >&2
  echo "Offending lines:" >&2
  shift
  "$@" >&2 || true
  rm -f "$OUT"
  exit 1
}

# 1. Pure ASCII. Smart quotes and dashes survive a copy-paste badly.
if grep -qP '[^\x00-\x7F]' "$OUT"; then
  fail "non-ASCII characters found" grep -nP '[^\x00-\x7F]' "$OUT"
fi

# 2. No Markdown fences or inline code ticks - a backtick is not valid in
#    PostgreSQL anywhere, so any occurrence is a bug.
if grep -q '`' "$OUT"; then
  fail "backticks found" grep -n '`' "$OUT"
fi

# 3. No Markdown headings.
if grep -qE '^[[:space:]]*#' "$OUT"; then
  fail "Markdown heading or shell comment found" grep -nE '^[[:space:]]*#' "$OUT"
fi

# 4. No backslash-escaped punctuation of the kind Markdown renderers insert.
if grep -qE '\\[_.*\[\]()#+-]' "$OUT"; then
  fail "escaped Markdown punctuation found" grep -nE '\\[_.*\[\]()#+-]' "$OUT"
fi

# 5. Every line must be blank, a "--" comment, or SQL. Prose outside a comment
#    is what produces "syntax error at or near ...". Detect the common shape:
#    a line of plain words with no SQL punctuation at all.
if grep -qnE '^[[:space:]]*[A-Z][a-z]+([[:space:]]+[A-Za-z,]+)+[[:space:]]*$' "$OUT"; then
  fail "prose outside an SQL comment" \
    grep -nE '^[[:space:]]*[A-Z][a-z]+([[:space:]]+[A-Za-z,]+)+[[:space:]]*$' "$OUT"
fi

LINES=$(wc -l < "$OUT" | tr -d ' ')
BYTES=$(wc -c < "$OUT" | tr -d ' ')
echo "Wrote $OUT"
echo "  ${LINES} lines, ${BYTES} bytes, pure ASCII, validation passed"
