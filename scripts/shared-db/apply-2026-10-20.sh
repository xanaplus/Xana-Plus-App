#!/usr/bin/env bash
# App-side fixes from the website team's note of 20 Oct 2026.
# Run from the repo root:  bash scripts/shared-db/apply-2026-10-20.sh   (add --yes from Claude Code's "!")
#
#  - Applies 20261020090000_no_fee_on_prescription_orders.sql: prescription orders no longer
#    add KSh 20, matching app orders since 15 Oct.
#  - Deploys place-order: unit prices stay exactly as BC has them (83.83333, not 83.83); only
#    the line total is rounded to the cent, as create_order() and the website do.
# If db push stops with "Remote migration versions not found", the website team applied new
# migrations since 17 Oct: nothing is changed, tell Claude and it will add placeholders.
set -euo pipefail
export npm_config_loglevel=error

SECRETS="C:/Users/user/.secrets/Xana Plus App"
export SUPABASE_ACCESS_TOKEN="$(tr -d '[:space:]' < "$SECRETS/superbase-xanaplusapp.txt")"
export SUPABASE_DB_PASSWORD="$(tr -d '[:space:]' < "$SECRETS/superbase-db-password.txt")"

echo "== What will be applied (should be only 20261020090000_no_fee_on_prescription_orders)"
npx supabase db push --dry-run
if [[ "${1:-}" != "--yes" ]]; then
  read -r -p "Apply it and deploy place-order? [y/N] " yes || yes=""
  [[ "$yes" == "y" ]] || { echo "Stopped. Nothing was applied. Run again with --yes to apply."; exit 1; }
fi
npx supabase db push
npx supabase functions deploy place-order --project-ref yinlbtldfojobuwddpsj
echo "== Done."
