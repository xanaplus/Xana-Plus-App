#!/usr/bin/env bash
# Deploys place-order: orders now leave from the store the customer picked (saved as
# branch_code) and stock is checked at that branch. Older app builds keep working.
# Run from the repo root:  bash scripts/shared-db/deploy-place-order-2026-10-15.sh
set -euo pipefail
export npm_config_loglevel=error
export SUPABASE_ACCESS_TOKEN="$(tr -d '[:space:]' < "C:/Users/user/.secrets/Xana Plus App/superbase-xanaplusapp.txt")"
npx supabase functions deploy place-order --project-ref yinlbtldfojobuwddpsj
echo "== Done. Place a test order on the app and check it says the store you picked."
