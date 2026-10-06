#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

# Reproduce the merged lockfile without prompts or dependency version changes.
npm ci --no-audit --no-fund

# This project uses an existing shared Supabase backend. Never apply migrations
# or deploy Edge Functions automatically when merging application changes.
npm run typecheck
