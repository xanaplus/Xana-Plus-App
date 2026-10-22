#!/usr/bin/env bash
# "Order received" SMS for app orders (owner, 22 Oct 2026).
# Run from the repo root:  bash scripts/shared-db/apply-2026-10-22.sh   (add --yes from Claude Code's "!")
#
#  - Applies 20261022120000_app_order_received_sms.sql: the outbox accepts a new kind,
#    sms_order_received (the live list of kinds is kept and extended).
#  - Deploys place-order: every app order queues one sms_order_received row. The website
#    team's outbox-send sends it once they add the wording.
# If db push stops with "Remote migration versions not found", the website team applied new
# migrations since 21 Oct: nothing is changed, tell Claude and it will add placeholders.
set -euo pipefail
export npm_config_loglevel=error

SECRETS="C:/Users/user/.secrets/Xana Plus App"
export SUPABASE_ACCESS_TOKEN="$(tr -d '[:space:]' < "$SECRETS/superbase-xanaplusapp.txt")"
export SUPABASE_DB_PASSWORD="$(tr -d '[:space:]' < "$SECRETS/superbase-db-password.txt")"

echo "== What will be applied (should be only 20261022120000_app_order_received_sms)"
npx supabase db push --dry-run
if [[ "${1:-}" != "--yes" ]]; then
  read -r -p "Apply it and deploy place-order? [y/N] " yes || yes=""
  [[ "$yes" == "y" ]] || { echo "Stopped. Nothing was applied. Run again with --yes to apply."; exit 1; }
fi
npx supabase db push
npx supabase functions deploy place-order --project-ref yinlbtldfojobuwddpsj
echo "== Done."
