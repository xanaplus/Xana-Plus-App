// Business Central item sync — refreshes `products` from the BC Nexus/artemis API.
// Taken from the Xana Ledger guide (C:/Users/user/.secrets/BC/bc-items-sync-guide.md);
// read its section 9 before changing anything marked ⚠️.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (injected by Supabase),
//      BC_TENANT_ID, BC_CLIENT_ID, BC_CLIENT_SECRET, BC_BASE_URL, BC_ENVIRONMENT,
//      BC_COMPANY, BC_SYNC_SECRET.
//
// Callers prove themselves with the `x-sync-secret` header (pg_cron reads it
// from Vault), so the function is not triggerable with the public app key.
//
// ⚠️ $select IS NOT OPTIONAL. Every BC item carries a base64 product image
// (~85KB). Unfiltered, the catalogue is ~900MB and the function dies; with
// $select it is ~2MB. (Images are deliberately not synced into Supabase.)
//
// ⚠️ $orderby=no IS NOT OPTIONAL EITHER. This endpoint returns no
// @odata.nextLink, so paging is $skip-based, and $skip over an unordered
// result set may repeat or silently drop rows between pages.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const PAGE_SIZE = 1000;
/** A run still marked running after this long was killed; a new one may start. */
const STALE_RUN_MS = 10 * 60 * 1000;

// Every field `products` is filled from. Anything not listed is left alone on update.
const SELECT_FIELDS = [
  'no',
  'description',
  'itemCategoryCode',
  'lastDirectCost',
  'unitPrice',
  'inventory',
  'barcode',
  'vATPostingGroup',
  'inventoryPostingGroup',
].join(',');

interface BCItem {
  no?: string;
  description?: string;
  itemCategoryCode?: string;
  lastDirectCost?: number;
  unitPrice?: number;
  inventory?: number;
  barcode?: string;
  vATPostingGroup?: string;
  inventoryPostingGroup?: string;
}

async function getBCToken(): Promise<string> {
  const tenantId = Deno.env.get('BC_TENANT_ID');
  const clientId = Deno.env.get('BC_CLIENT_ID');
  const clientSecret = Deno.env.get('BC_CLIENT_SECRET');
  if (!tenantId || !clientId || !clientSecret) {
    throw new Error('BC_TENANT_ID, BC_CLIENT_ID and BC_CLIENT_SECRET must be set');
  }

  const params = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
    scope: 'https://api.businesscentral.dynamics.com/.default',
  });
  const res = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  if (!res.ok) throw new Error(`BC token fetch failed: ${res.status} ${(await res.text()).slice(0, 300)}`);
  const { access_token } = (await res.json()) as { access_token: string };
  return access_token;
}

/**
 * GET with bounded retry on 429 / 5xx. A failure on page 7 would otherwise
 * abort with two thirds written, and the rest would look absent from BC.
 */
async function getWithRetry(url: string, token: string, attempts = 3): Promise<Response> {
  let last: Error | null = null;
  for (let i = 0; i < attempts; i++) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
    if (res.ok) return res;

    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || i === attempts - 1) {
      throw new Error(`BC items request failed: ${res.status} ${(await res.text()).slice(0, 300)}`);
    }
    await res.text().catch(() => {});
    const retryAfter = Number(res.headers.get('retry-after'));
    const waitMs = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 10_000) : 1000 * Math.pow(2, i);
    console.warn(`BC returned ${res.status}, retrying in ${waitMs}ms (attempt ${i + 2}/${attempts})`);
    await new Promise(r => setTimeout(r, waitMs));
    last = new Error(`BC items request failed: ${res.status}`);
  }
  throw last ?? new Error('BC items request failed');
}

/** Page through the full catalogue, ordered by item number. */
async function fetchAllItems(token: string): Promise<{ items: BCItem[]; pages: number }> {
  const baseUrl = Deno.env.get('BC_BASE_URL')?.replace(/\/$/, '');
  const environment = Deno.env.get('BC_ENVIRONMENT');
  const company = Deno.env.get('BC_COMPANY');
  if (!baseUrl || !environment || !company) throw new Error('BC_BASE_URL, BC_ENVIRONMENT and BC_COMPANY must be set');

  const endpoint = `${baseUrl}/V2.0/${environment}/api/Nexus/artemis/v1.0/companies(${company})/items`;
  const items: BCItem[] = [];
  let skip = 0;
  let pages = 0;

  while (true) {
    const url = `${endpoint}?$top=${PAGE_SIZE}&$skip=${skip}&$orderby=no&$select=${SELECT_FIELDS}`;
    const res = await getWithRetry(url, token);
    const { value } = (await res.json()) as { value?: BCItem[] };
    const page = value ?? [];

    items.push(...page);
    pages++;
    console.log(`page ${pages} (skip=${skip}): ${page.length} items (total ${items.length})`);

    if (page.length < PAGE_SIZE) break;
    skip += page.length;
    // ~11 pages today. Past 50, $skip is not advancing and we would loop forever.
    if (pages > 50) throw new Error(`Pagination runaway: ${pages} pages fetched, aborting`);
  }
  return { items, pages };
}

/**
 * The products columns BC owns. ⚠️ Deliberately partial: profit_percent,
 * vendor_no, shopify_synced, item_category_code_1, inventory_posting_group_1
 * and default_deferral_template come only from the Excel import — including
 * them here would null them out on every run.
 */
function toProductRow(item: BCItem, syncedAt: string) {
  return {
    item_no: item.no!.trim(),
    description: item.description ?? null,
    item_category_code: item.itemCategoryCode || null,
    last_direct_cost: item.lastDirectCost ?? 0,
    unit_price: item.unitPrice ?? 0,
    inventory: item.inventory ?? 0,
    gtin: item.barcode || null,
    vat_prod_posting_group: item.vATPostingGroup || null,
    inventory_posting_group: item.inventoryPostingGroup || null,
    is_active: true,
    last_synced_at: syncedAt,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ success: false, error: 'Method not allowed' }, 405);

  const expected = Deno.env.get('BC_SYNC_SECRET');
  if (!expected || req.headers.get('x-sync-secret') !== expected) return json({ success: false, error: 'Forbidden' }, 403);

  const startedAt = Date.now();
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // pg_cron posts an empty body; a manual run sends {"trigger":"manual"}.
  let trigger = 'cron';
  try {
    const body = (await req.json()) as { trigger?: string };
    if (body?.trigger === 'manual') trigger = 'manual';
  } catch {
    /* empty body is the cron case */
  }

  // One run at a time: a manual run during the nightly one would double the BC calls.
  const { data: running } = await supabase
    .from('bc_sync_runs')
    .select('id')
    .eq('status', 'running')
    .gt('started_at', new Date(Date.now() - STALE_RUN_MS).toISOString())
    .limit(1);
  if (running && running.length > 0) return json({ success: false, error: 'A sync is already running' }, 409);

  const { data: run } = await supabase.from('bc_sync_runs').insert({ trigger, status: 'running' }).select('id').single();
  const runId = run?.id as string | undefined;

  const finish = async (fields: Record<string, unknown>) => {
    if (!runId) return;
    await supabase
      .from('bc_sync_runs')
      .update({ ...fields, finished_at: new Date().toISOString(), duration_ms: Date.now() - startedAt })
      .eq('id', runId);
  };

  try {
    const token = await getBCToken();
    const { items, pages } = await fetchAllItems(token);

    // An item card with no `no` cannot be keyed on.
    const valid = items.filter(i => (i.no ?? '').trim() !== '');
    const skippedNoKey = items.length - valid.length;
    if (skippedNoKey > 0) console.warn(`${skippedNoKey} BC item(s) had no item number — skipped`);

    // Otherwise the deactivation pass would flag the whole catalogue as gone.
    if (valid.length === 0) throw new Error('BC returned zero usable items — aborting before any write');

    const syncedAt = new Date().toISOString();
    const bcItemNos = valid.map(i => i.no!.trim());

    // Only to report created vs updated honestly; upsert does not say.
    const existing = new Set<string>();
    for (let i = 0; i < bcItemNos.length; i += 1000) {
      const { data, error } = await supabase.from('products').select('item_no').in('item_no', bcItemNos.slice(i, i + 1000));
      if (error) throw new Error(`Existing-item lookup failed: ${error.message}`);
      for (const r of data ?? []) existing.add(r.item_no as string);
    }

    let written = 0;
    for (let i = 0; i < valid.length; i += 500) {
      const batch = valid.slice(i, i + 500).map(it => toProductRow(it, syncedAt));
      const { error } = await supabase.from('products').upsert(batch, { onConflict: 'item_no', ignoreDuplicates: false });
      if (error) throw new Error(`Upsert failed at row ${i}: ${error.message}`);
      written += batch.length;
    }

    const createdCount = bcItemNos.filter(n => !existing.has(n)).length;
    const updatedCount = written - createdCount;

    // ── Deactivation pass ──────────────────────────────────────────────────
    // Guarded by the zero-item abort above and this 80% check: a short but
    // valid BC response must not soft-delete thousands of live products.
    const { count: activeProducts } = await supabase
      .from('products')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true);

    const expectedCount = activeProducts ?? 0;
    if (expectedCount > 0 && valid.length < expectedCount * 0.8) {
      const warning = `Deactivation skipped: BC returned ${valid.length} items vs ${expectedCount} local products`;
      console.warn(warning);
      await finish({
        status: 'partial',
        bc_item_count: valid.length,
        created_count: createdCount,
        updated_count: updatedCount,
        deactivated_count: 0,
        pages_fetched: pages,
        error: warning,
      });
      return json({ success: true, status: 'partial', bc_item_count: valid.length, created: createdCount, updated: updatedCount, deactivated: 0, pages, warning });
    }

    // Anything not carrying this run's stamp is no longer in BC. Two statements,
    // not one .or(): PostgREST's `or` uses `.` as a separator and ISO times are full of them.
    const { data: staleRows, error: staleError } = await supabase
      .from('products')
      .update({ is_active: false })
      .eq('is_active', true)
      .lt('last_synced_at', syncedAt)
      .select('item_no');
    if (staleError) throw new Error(`Deactivation failed: ${staleError.message}`);

    const { data: neverSyncedRows, error: neverSyncedError } = await supabase
      .from('products')
      .update({ is_active: false })
      .eq('is_active', true)
      .is('last_synced_at', null)
      .select('item_no');
    if (neverSyncedError) throw new Error(`Deactivation failed: ${neverSyncedError.message}`);

    const deactivatedCount = (staleRows?.length ?? 0) + (neverSyncedRows?.length ?? 0);

    await finish({
      status: 'success',
      bc_item_count: valid.length,
      created_count: createdCount,
      updated_count: updatedCount,
      deactivated_count: deactivatedCount,
      pages_fetched: pages,
    });

    return json({
      success: true,
      status: 'success',
      bc_item_count: valid.length,
      created: createdCount,
      updated: updatedCount,
      deactivated: deactivatedCount,
      pages,
      duration_ms: Date.now() - startedAt,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('bc-items-sync failed:', message);
    await finish({ status: 'failed', error: message });
    return json({ success: false, error: message }, 500);
  }
});
