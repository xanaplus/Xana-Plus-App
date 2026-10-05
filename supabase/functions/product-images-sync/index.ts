// Product photo sync: asks the Xana POS image API for each catalogue item's
// photo address and stores it in products.photo_url. The photo itself is never
// downloaded or stored (the app loads the public address directly).
// API guide: C:/Users/user/.secrets/Images/product-image-api.md.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (injected by Supabase),
//      XANA_PRODUCT_IMAGE_TOKEN, BC_SYNC_SECRET.
//
// pg_cron calls this every 2 minutes with the `x-sync-secret` header. Each run
// takes the next batch of items never asked or last asked over a week ago, so
// the job resumes by itself and needs no run log.
//
// The POS allows 600 requests a minute; requests start every 125 ms (8/s) no
// matter how slow each answer is, and the run stops starting new ones after
// TIME_BUDGET_MS so it always finishes before the next cron call.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const API = 'https://xana.afyanalytics.net/api/inventory/product-image';
const BATCH = 600;
const INTERVAL_MS = 125;
const TIME_BUDGET_MS = 90_000;
const REQUEST_TIMEOUT_MS = 15_000;
const RECHECK_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** 401 / 503: retrying won't help, so the whole run stops. */
class FatalApiError extends Error {}

/** One item's lookup: the address, null for "no photo", or undefined when it couldn't be asked. */
async function fetchPhotoUrl(token: string, itemNo: string): Promise<string | null | undefined> {
  const url = `${API}?item_no=${encodeURIComponent(itemNo)}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      await sleep(2 ** (attempt + 1) * 1000);
      continue;
    }
    if (res.status === 200) {
      const body = (await res.json()) as { image_url?: string | null };
      return body.image_url ?? null;
    }
    if (res.status === 401 || res.status === 503) {
      throw new FatalApiError(`${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    await res.body?.cancel();
    if (res.status === 422) return null;
    if (res.status === 429) {
      await sleep(Number(res.headers.get('retry-after') ?? 60) * 1000);
      continue;
    }
    await sleep(2 ** (attempt + 1) * 1000);
  }
  return undefined; // left unchecked; the next run asks again
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ success: false, error: 'Method not allowed' }, 405);

  const expected = Deno.env.get('BC_SYNC_SECRET');
  if (!expected || req.headers.get('x-sync-secret') !== expected) return json({ success: false, error: 'Forbidden' }, 403);

  const token = Deno.env.get('XANA_PRODUCT_IMAGE_TOKEN');
  if (!token) return json({ success: false, error: 'XANA_PRODUCT_IMAGE_TOKEN is not set' }, 503);

  const startedAt = Date.now();
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // Only what customers can see (the catalogue view's filter), never-asked first.
  const due = new Date(Date.now() - RECHECK_AFTER_MS).toISOString();
  const { data: items, error } = await supabase
    .from('products')
    .select('item_no')
    .eq('is_active', true)
    .gt('unit_price', 0)
    .or(`photo_checked_at.is.null,photo_checked_at.lt."${due}"`)
    .order('photo_checked_at', { ascending: true, nullsFirst: true })
    .order('item_no')
    .limit(BATCH);
  if (error) return json({ success: false, error: error.message }, 500);
  if (!items?.length) return json({ success: true, checked: 0, withPhoto: 0 });

  const results: { item_no: string; photo_url: string | null }[] = [];
  let fatal: string | undefined;
  const pending: Promise<void>[] = [];

  for (const { item_no } of items as { item_no: string }[]) {
    if (fatal || Date.now() - startedAt > TIME_BUDGET_MS) break;
    pending.push(
      fetchPhotoUrl(token, item_no)
        .then(photo => {
          if (photo !== undefined) results.push({ item_no, photo_url: photo });
        })
        .catch(e => {
          fatal = e instanceof FatalApiError ? e.message : String(e);
        }),
    );
    await sleep(INTERVAL_MS);
  }
  await Promise.all(pending);

  // Saved even after a fatal error, so answers already received aren't asked again.
  let saved = 0;
  if (results.length) {
    const { data, error: saveError } = await supabase.rpc('set_product_photos', { rows: results });
    if (saveError) return json({ success: false, error: saveError.message }, 500);
    saved = data as number;
  }

  const body = {
    success: !fatal,
    checked: saved,
    withPhoto: results.filter(r => r.photo_url).length,
    durationMs: Date.now() - startedAt,
    ...(fatal ? { error: `POS image API: ${fatal}` } : {}),
  };
  if (fatal) console.error(body.error);
  return json(body, fatal ? 502 : 200);
});
