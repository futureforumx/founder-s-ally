#!/usr/bin/env bash
# Deploy workspace edge functions. Requires SUPABASE_ACCESS_TOKEN in .env.local:
# https://supabase.com/dashboard/account/tokens
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -f .env.local ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env.local
  set +a
fi

if [[ -z "${SUPABASE_ACCESS_TOKEN:-}" ]]; then
  echo "Missing SUPABASE_ACCESS_TOKEN."
  echo "1. Create a token: https://supabase.com/dashboard/account/tokens"
  echo "2. Add to .env.local: SUPABASE_ACCESS_TOKEN=sbp_your_token_here"
  echo "3. Run: npm run supabase:functions"
  exit 1
fi

REF="${VITE_SUPABASE_PROJECT_ID:-}"
if [[ -z "$REF" && -n "${VITE_SUPABASE_URL:-}" ]]; then
  REF="$(printf '%s' "$VITE_SUPABASE_URL" | sed -n 's|https://\([a-z0-9]*\)\.supabase\.co.*|\1|p')"
fi
if [[ -z "$REF" ]]; then
  echo "Set VITE_SUPABASE_PROJECT_ID or VITE_SUPABASE_URL in .env.local so the deploy target is known."
  exit 1
fi

export SUPABASE_ACCESS_TOKEN
echo "Deploying to project ref: $REF"

npx supabase@latest functions deploy create-company-workspace --project-ref "$REF" --no-verify-jwt --use-api
npx supabase@latest functions deploy claim-company-workspace --project-ref "$REF" --no-verify-jwt --use-api
npx supabase@latest functions deploy complete-founder-onboarding --project-ref "$REF" --no-verify-jwt --use-api

echo "Done."
