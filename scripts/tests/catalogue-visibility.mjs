// Fixed rollback-only SQL plus public API reads/permission probes. No migrations.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_KEY;
const token = process.env.SUPABASE_ACCESS_TOKEN;
assert.ok(url && key && token,'Required visibility test configuration is missing');
const project = new URL(url).hostname.split('.')[0];
assert.match(project,/^[a-z0-9]+$/);
const codes = (await readFile(new URL('../../docs/hide-from-website.csv',import.meta.url),'utf8')).trim().split(/\r?\n/).slice(1);
assert.equal(codes.length,60);
assert.equal(new Set(codes).size,60);
assert.ok(codes.every(code=>/^(DEL|FS)\d{4}$/.test(code)));
const migration = await readFile(new URL('../../supabase/migrations/20261010010000_customer_catalogue_visibility.sql',import.meta.url),'utf8');
assert.deepEqual(new Set([...migration.matchAll(/'(?:DEL|FS)\d{4}'/g)].map(m=>m[0].slice(1,-1))),new Set(codes));
const source = await readFile(new URL('../../supabase/functions/bc-items-sync/index.ts',import.meta.url),'utf8');
assert.doesNotMatch(source,/\bshow_on_website\s*:/,'BC sync must not supply the visibility flag');

const sql = await readFile(new URL('./catalogue-visibility.sql',import.meta.url),'utf8');
const statements = sql.replace(/^--.*$/gm,'').trim();
assert.match(statements,/^begin;/i);
assert.match(statements,/rollback;$/i);
assert.doesNotMatch(statements,/\bcommit\b/i);
const response = await fetch(`https://api.supabase.com/v1/projects/${project}/database/query`,{
  method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
  body:JSON.stringify({query:sql}),signal:AbortSignal.timeout(60000),
});
assert.ok(response.ok,`Rollback-only visibility check failed (HTTP ${response.status})`);
const result = await response.json();
assert.ok(result.some(row=>row.result?.startsWith('PASS:')),'Rollback-only success marker missing');

const db = createClient(url,key,{auth:{persistSession:false}});
const hidden = await db.from('catalogue').select('item_no',{count:'exact',head:true}).in('item_no',codes);
assert.equal(hidden.error,null,'Public catalogue request failed');
assert.equal(hidden.count,0,'Listed products are still exposed through the public API');
const publicSample = await db.from('catalogue').select('item_no,price,price_tiers,requires_rx,age_restricted').eq('item_no','AF0005').single();
assert.equal(publicSample.error,null,'Existing public price/regulatory fields are not readable');
assert.ok(Number(publicSample.data.price)>0 && Array.isArray(publicSample.data.price_tiers));
const privateFlag = await db.from('catalogue').select('show_on_website').limit(1);
assert.ok(privateFlag.error,'Local visibility flag must not be public');
// Nonexistent row: even if permissions regress, this probe cannot modify a product.
const update = await db.from('catalogue').update({name:'Synthetic permission probe'}).eq('item_no','__never_existing_permission_probe__');
assert.equal(update.error?.code,'42501','Public catalogue must deny updates');
console.log('PASS: exact 60-item list, BC upsert preservation, default visibility, reversible flag, hidden public API rows, preserved price/regulatory fields, private flag and read-only public access. No changes committed.');
