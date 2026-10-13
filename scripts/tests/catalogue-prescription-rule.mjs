// Fixed rollback-only fixtures and public reads; never creates real orders.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';

assert.ok(process.env.EXPO_PUBLIC_SUPABASE_URL && process.env.EXPO_PUBLIC_SUPABASE_KEY && process.env.SUPABASE_ACCESS_TOKEN,
  'Prescription rule test configuration is missing');
const project = new URL(process.env.EXPO_PUBLIC_SUPABASE_URL).hostname.split('.')[0];
assert.match(project, /^[a-z0-9]+$/);
const sql = await readFile(new URL('./catalogue-prescription-rule.sql', import.meta.url), 'utf8');
const statements = sql.replace(/^--.*$/gm, '').trim();
assert.match(statements, /^begin;/i);
assert.match(statements, /rollback;$/i);
assert.doesNotMatch(statements, /\bcommit\b/i);
const response = await fetch(`https://api.supabase.com/v1/projects/${project}/database/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: sql }),
  signal: AbortSignal.timeout(60000),
});
assert.ok(response.ok, `Rollback-only prescription rule check failed (${response.status})`);
const result = await response.json();
assert.ok(result.some(row => row.result?.startsWith('PASS:')), 'Rollback-only success marker missing');

const db = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.EXPO_PUBLIC_SUPABASE_KEY,
  { auth: { persistSession: false } });
const request = async query => {
  const reply = await query;
  assert.equal(reply.error, null, 'Public catalogue check failed');
  return reply;
};
const totalRx = await request(db.from('catalogue').select('item_no', { count: 'exact', head: true }).eq('requires_rx', true));
const controlled = await request(db.from('catalogue').select('item_no', { count: 'exact', head: true }).eq('category', 'CONTROLLED'));
assert.ok(controlled.count > 0, 'Expected existing Controlled items');
assert.equal(totalRx.count, controlled.count, 'Prescription count must match Controlled group count');
const mismatch = await request(db.from('catalogue').select('item_no', { count: 'exact', head: true })
  .eq('requires_rx', true).neq('category', 'CONTROLLED'));
assert.equal(mismatch.count, 0, 'Non-Controlled items still require prescriptions');
const missing = await request(db.from('catalogue').select('item_no', { count: 'exact', head: true })
  .eq('category', 'CONTROLLED').eq('requires_rx', false));
assert.equal(missing.count, 0, 'Controlled items are missing the prescription gate');
const fixtures = await request(db.from('catalogue').select('item_no', { count: 'exact', head: true }).like('item_no', '__rx_rule_%'));
assert.equal(fixtures.count, 0, 'Rollback-only fixtures were retained');
console.log(`PASS: ${controlled.count} Controlled items require prescriptions; no other group does. Rollback-only mapping, BC changes and preserved regulatory/visibility checks passed. No SMS or committed orders.`);
