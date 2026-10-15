#!/usr/bin/env bash
# App-side follow-ups to the website team's note of 15 Oct 2026 (message-to-roy-2026-10-15.md).
# Run from the repo root:  bash scripts/shared-db/apply-2026-10-15.sh   (add --yes from Claude Code's "!")
#
#  - Records the two migrations the website team applied today (admin_app, etims_signing) as
#    placeholders, so db push sees them as already applied. Their code is in xanaplus/Xana-Admin.
#  - Applies 20261015160000_api_role_hygiene.sql: the API roles can no longer call four trigger
#    functions, or truncate profiles. Nothing the app or website does uses either.
set -euo pipefail

SECRETS="C:/Users/user/.secrets/Xana Plus App"
export SUPABASE_ACCESS_TOKEN="$(tr -d '[:space:]' < "$SECRETS/superbase-xanaplusapp.txt")"
export SUPABASE_DB_PASSWORD="$(tr -d '[:space:]' < "$SECRETS/superbase-db-password.txt")"

echo "== What will be applied (should be only 20261015160000_api_role_hygiene)"
npx supabase db push --dry-run
if [[ "${1:-}" != "--yes" ]]; then
  read -r -p "Apply it? [y/N] " yes || yes=""
  [[ "$yes" == "y" ]] || { echo "Stopped. Nothing was applied. Run again with --yes to apply."; exit 1; }
fi
npx supabase db push
echo "== Done."
