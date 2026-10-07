// Executes only the fixed rollback-only fixture, never migrations or arbitrary SQL.
// Backend credentials are consumed from the environment and never logged.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const token = process.env.SUPABASE_ACCESS_TOKEN;
assert.ok(url && token, 'Required backend test configuration is missing');
const project = new URL(url).hostname.split('.')[0];
assert.match(project, /^[a-z0-9]+$/);
const sql = await readFile(new URL('./prescription-first.sql', import.meta.url), 'utf8');
const statements = sql.replace(/^--.*$/gm, '').trim();
assert.match(statements, /^begin;/i, 'Test must start with BEGIN');
assert.match(statements, /rollback;$/i, 'Test must end with ROLLBACK');
assert.doesNotMatch(statements, /\bcommit\b/i, 'COMMIT is forbidden');
const response = await fetch(`https://api.supabase.com/v1/projects/${project}/database/query`, {
  method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: sql }), signal: AbortSignal.timeout(60000),
});
// Never print raw backend errors, identifiers, connection details or tokens.
assert.ok(response.ok, `Rollback-only database check failed (HTTP ${response.status}); no success is claimed.`);
const result = await response.json();
assert.ok(Array.isArray(result) && result.some(row => typeof row.result === 'string' && row.result.startsWith('PASS:')),
  'Rollback-only check did not return its success marker');
console.log('PASS: rollback-only prescription database checks, including synthetic stock/price changes, expiry, exact totals, hold/decline/cancel, and repeated confirmation. No changes committed.');
