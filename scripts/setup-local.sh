#!/usr/bin/env bash
#
# One-command local setup.
#
#   ./scripts/setup-local.sh
#
# Starts the local Supabase stack (applying every migration), then writes the
# generated URL and anon key into .env.local. Those values are generated on your
# machine and are not secret — they are the same for every local Supabase
# install, and Row Level Security is what protects the data.
#
# Requires Docker to be running.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if ! docker info >/dev/null 2>&1; then
  echo "Docker does not appear to be running." >&2
  echo "Start Docker Desktop (or your Docker daemon) and run this again." >&2
  exit 1
fi

echo "==> Starting Supabase (first run downloads images and may take a few minutes)"
npx supabase start

echo
echo "==> Reading local credentials"
STATUS="$(npx supabase status -o env)"

get() {
  printf '%s\n' "$STATUS" | grep -E "^$1=" | head -1 | cut -d= -f2- | tr -d '"'
}

API_URL="$(get API_URL)"
ANON_KEY="$(get ANON_KEY)"

if [ -z "$API_URL" ] || [ -z "$ANON_KEY" ]; then
  echo "Could not read the API URL or anon key from 'supabase status'." >&2
  echo "Run 'npx supabase status' yourself and copy them into .env.local." >&2
  exit 1
fi

if [ -f .env.local ]; then
  cp .env.local ".env.local.backup.$(date +%s)"
  echo "    existing .env.local backed up"
fi

cat > .env.local <<EOF
# Written by scripts/setup-local.sh — local development only.
NEXT_PUBLIC_SUPABASE_URL=$API_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=$ANON_KEY
NEXT_PUBLIC_SITE_URL=http://localhost:3000

# Needed from Phase 5 onward, for AI report generation.
OPENAI_API_KEY=
EOF

echo "    wrote .env.local"
echo
echo "==> Ready. Start the app with:"
echo
echo "      npm run dev"
echo
echo "    Then open http://localhost:3000"
echo
echo "    Supabase Studio (browse your data): http://127.0.0.1:54323"
echo "    Confirmation emails are caught locally at: http://127.0.0.1:54324"
