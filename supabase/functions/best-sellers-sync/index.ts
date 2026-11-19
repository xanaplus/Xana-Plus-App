// Best sellers per pickup branch, from Business Central's till sales (nightly, pg_cron).
//
// salesLinesBuffer holds the till lines but no date. Receipt numbers are a branch prefix
// plus one rising sequence (SYO334137 on 21 Aug 2026, SYO442... in Nov), so the first
// receipt on the window's start day (from salesInvoiceHeaders, which has the date) marks
// where the window begins: every line with that prefix and a number at or above it.
// Items are ranked by how many receipts they were on, not units: tablets sell singly.
//
// Env: BC_TENANT_ID, BC_CLIENT_ID, BC_CLIENT_SECRET, BC_BASE_URL, BC_ENVIRONMENT,
// BC_COMPANY, BC_SYNC_SECRET (shared with bc-items-sync). Callers send x-sync-secret.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

/** App pickup branches: BC location code → receipt prefix. */
const BRANCHES: { location: string; prefix: string }[] = [
  { location: 'SYOKIMAU', prefix: 'SYO' },
  { location: 'RUIRU', prefix: 'RUI' },
];
const WINDOW_DAYS = 30;
const KEEP = 200;
const PAGE_SIZE = 5000;
const MAX_PAGES = 40;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

async function getBCToken(): Promise<string> {
  const tenantId = Deno.env.get('BC_TENANT_ID');
  const clientId = Deno.env.get('BC_CLIENT_ID');
  const clientSecret = Deno.env.get('BC_CLIENT_SECRET');
  if (!tenantId || !clientId || !clientSecret) throw new Error('BC credentials are not set');
  const res = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      scope: 'https://api.businesscentral.dynamics.com/.default',
    }).toString(),
  });
  if (!res.ok) throw new Error(`BC token fetch failed: ${res.status}`);
  return ((await res.json()) as { access_token: string }).access_token;
}

/** GET a BC page, retrying 429 / 5xx a few times. */
async function bcGet<T>(url: string, token: string, attempts = 3): Promise<T[]> {
  for (let i = 0; ; i++) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
    if (res.ok) return ((await res.json()) as { value?: T[] }).value ?? [];
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || i >= attempts - 1) throw new Error(`BC request failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
    await res.text().catch(() => undefined);
    await new Promise(resolve => setTimeout(resolve, 1000 * 2 ** i));
  }
}

const odataString = (value: string) => `'${value.replace(/'/g, "''")}'`;

/** The start day of the window, in Nairobi, as YYYY-MM-DD. */
function windowStart(now = new Date()): string {
  const start = new Date(now.getTime() - WINDOW_DAYS * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Nairobi', year: 'numeric', month: '2-digit', day: '2-digit' }).format(start);
}

async function rankBranch(endpoint: string, token: string, branch: { location: string; prefix: string }, since: string) {
  // First receipt of this branch on or after the start day.
  const headers = await bcGet<{ no: string }>(
    `${endpoint}/salesInvoiceHeaders?$filter=postingDate ge ${since} and startswith(no,${odataString(branch.prefix)})&$orderby=no&$top=1&$select=no`,
    token,
  );
  const first = headers[0]?.no;
  if (!first) return { lines: 0, ranked: [] as { item_no: string; receipts: number }[] };

  const filter = `documentNo ge ${odataString(first)} and startswith(documentNo,${odataString(branch.prefix)}) and locationCode eq ${odataString(branch.location)}`;
  const receiptsByItem = new Map<string, Set<string>>();
  let lines = 0;
  for (let page = 0, skip = 0; ; page++) {
    if (page >= MAX_PAGES) throw new Error(`${branch.location}: more than ${MAX_PAGES} pages, stopping`);
    const rows = await bcGet<{ documentNo: string; no: string; quantity: number }>(
      `${endpoint}/salesLinesBuffer?$filter=${encodeURIComponent(filter)}&$orderby=documentNo,lineNo&$top=${PAGE_SIZE}&$skip=${skip}&$select=documentNo,no,quantity`,
      token,
    );
    for (const row of rows) {
      const item = row.no?.trim();
      if (!item || !(row.quantity > 0)) continue; // returns and blank lines don't count
      let receipts = receiptsByItem.get(item);
      if (!receipts) receiptsByItem.set(item, (receipts = new Set()));
      receipts.add(row.documentNo);
    }
    lines += rows.length;
    if (rows.length < PAGE_SIZE) break;
    skip += rows.length;
  }

  const ranked = [...receiptsByItem.entries()]
    .map(([item_no, receipts]) => ({ item_no, receipts: receipts.size }))
    .sort((a, b) => b.receipts - a.receipts || a.item_no.localeCompare(b.item_no))
    .slice(0, KEEP);
  return { lines, ranked };
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ success: false, error: 'Method not allowed' }, 405);
  const expected = Deno.env.get('BC_SYNC_SECRET');
  if (!expected || req.headers.get('x-sync-secret') !== expected) return json({ success: false, error: 'Forbidden' }, 403);

  const baseUrl = Deno.env.get('BC_BASE_URL')?.replace(/\/$/, '');
  const environment = Deno.env.get('BC_ENVIRONMENT');
  const company = Deno.env.get('BC_COMPANY');
  if (!baseUrl || !environment || !company) return json({ success: false, error: 'BC settings are not set' }, 500);
  const endpoint = `${baseUrl}/V2.0/${environment}/api/Nexus/artemis/v1.0/companies(${company})`;

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const startedAt = Date.now();
  const since = windowStart();
  try {
    const token = await getBCToken();
    const results = await Promise.all(BRANCHES.map(branch => rankBranch(endpoint, token, branch, since)));
    const refreshedAt = new Date().toISOString();
    const summary: Record<string, { lines: number; items: number }> = {};

    for (const [index, branch] of BRANCHES.entries()) {
      const { lines, ranked } = results[index];
      summary[branch.location] = { lines, items: ranked.length };
      // Keep yesterday's list rather than blanking Home if BC returned nothing.
      if (ranked.length === 0) continue;
      const rows = ranked.map((entry, i) => ({ branch: branch.location, item_no: entry.item_no, receipts: entry.receipts, rank: i + 1, refreshed_at: refreshedAt }));
      const { error: upsertError } = await db.from('branch_best_sellers').upsert(rows, { onConflict: 'branch,item_no' });
      if (upsertError) throw new Error(`upsert ${branch.location}: ${upsertError.message}`);
      const { error: pruneError } = await db.from('branch_best_sellers').delete().eq('branch', branch.location).lt('refreshed_at', refreshedAt);
      if (pruneError) throw new Error(`prune ${branch.location}: ${pruneError.message}`);
    }

    console.log(`best sellers since ${since}`, summary);
    return json({ success: true, since, branches: summary, durationMs: Date.now() - startedAt });
  } catch (error) {
    console.error(error);
    return json({ success: false, error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
