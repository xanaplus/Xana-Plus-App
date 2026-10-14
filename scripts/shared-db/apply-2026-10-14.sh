#!/usr/bin/env bash
# App-side follow-ups to the website team's 13–14 Oct 2026 notes (roles-and-access,
# orders-and-payments). Run from the repo root:  bash scripts/shared-db/apply-2026-10-14.sh
#
#  1. Database: lock the sign-in phone and email, drop the leftover _xana_apply_roles
#     (migration 20261014220000_lock_sign_in_identity.sql). The five migrations the
#     website team applied on 14 Oct are now in supabase/migrations under their live
#     version numbers, so db push sees them as already applied.
#  2. Sign-in service settings: public sign-up off (verify-otp makes accounts through
#     the admin API, which this does not affect), passwords at least 8 characters,
#     secure password change on.
#     The leaked-password check needs the Pro plan; this project is on Free, so it is skipped.
set -euo pipefail

SECRETS="C:/Users/user/.secrets/Xana Plus App"
REF=yinlbtldfojobuwddpsj
export SUPABASE_ACCESS_TOKEN="$(tr -d '[:space:]' < "$SECRETS/superbase-xanaplusapp.txt")"
export SUPABASE_DB_PASSWORD="$(tr -d '[:space:]' < "$SECRETS/superbase-db-password.txt")"

echo "== 1. Database: what will be applied (should be only 20261014220000_lock_sign_in_identity)"
npx supabase db push --dry-run
read -r -p "Apply it? [y/N] " yes
[[ "$yes" == "y" ]] || { echo "Stopped."; exit 1; }
npx supabase db push

echo "== 2. Sign-in settings"
curl -sS -f -X PATCH "https://api.supabase.com/v1/projects/$REF/config/auth" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" \
  -d '{"disable_signup": true, "password_min_length": 8, "security_update_password_require_reauthentication": true}' \
  -o /dev/null && echo "Saved."
curl -sS -f "https://api.supabase.com/v1/projects/$REF/config/auth" -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" |
  node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const c=JSON.parse(s);console.log({disable_signup:c.disable_signup,password_min_length:c.password_min_length,secure_password_change:c.security_update_password_require_reauthentication})})'

echo "== Done. Now sign in on the app with a real phone to confirm sign-in still works."
