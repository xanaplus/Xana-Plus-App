import { createClient } from 'jsr:@supabase/supabase-js@2';

const fields = 'itemNo,salesType,salesCode,startingDate,currencyCode,variantCode,unitOfMeasureCode,minimumQuantity,unitPrice,priceIncludesVAT,endingDate';
const ordering = 'itemNo,salesType,salesCode,startingDate,currencyCode,variantCode,unitOfMeasureCode,minimumQuantity';
const pageSize = 1000;

type BCPrice = {
  itemNo: string; salesType: string; salesCode: string; startingDate: string; endingDate: string;
  currencyCode: string; variantCode: string; unitOfMeasureCode: string;
  minimumQuantity: number; unitPrice: number; priceIncludesVAT: boolean;
  item?: { no: string; baseUnitOfMeasure: string; vATPostingGroup: string };
  itemUnitOfMeasure?: { code: string; qtyPerUnitOfMeasure: number } | null;
};
type VatRow = { vatBusPostingGroup: string; vatProdPostingGroup: string; vat: number };
const unlimitedDate = (date: string) => !date || date === '0001-01-01' ? null : date;

Deno.serve(async request => {
  const secret = Deno.env.get('BC_SYNC_SECRET');
  if (request.method !== 'POST' || !secret || request.headers.get('x-sync-secret') !== secret)
    return Response.json({ error: 'forbidden' }, { status: 403 });
  const startedAt = new Date().toISOString();
  try {
    const tenant = Deno.env.get('BC_TENANT_ID');
    const client = Deno.env.get('BC_CLIENT_ID');
    const credential = Deno.env.get('BC_CLIENT_SECRET');
    const base = Deno.env.get('BC_BASE_URL')?.replace(/\/$/, '');
    const environment = Deno.env.get('BC_ENVIRONMENT');
    const company = Deno.env.get('BC_COMPANY');
    if (!tenant || !client || !credential || !base || !environment || !company) throw new Error('missing_bc_configuration');
    const authentication = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'client_credentials', client_id: client,
        client_secret: credential, scope: 'https://api.businesscentral.dynamics.com/.default' }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!authentication.ok) throw new Error(`bc_auth_http_${authentication.status}`);
    const { access_token: token } = await authentication.json();
    const root = `${base}/V2.0/${environment}/api/Nexus/artemis/v1.0/companies(${company})`;
    const get = async (url: string) => {
      for (let attempt = 0; attempt < 3; attempt++) {
        const response = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, signal: AbortSignal.timeout(30_000) });
        if (response.ok) return response.json();
        await response.body?.cancel();
        if (!(response.status === 429 || response.status >= 500) || attempt === 2) throw new Error(`bc_prices_http_${response.status}`);
        await new Promise(resolve => setTimeout(resolve, 1000 * 2 ** attempt));
      }
      throw new Error('bc_prices_unavailable');
    };
    const prices: BCPrice[] = [];
    let complete = false;
    for (let page = 0; page < 50; page++) {
      // Explicit fields/expansion never fetch the large base64 item image.
      const query = new URLSearchParams({
        '$top': String(pageSize), '$skip': String(page * pageSize), '$orderby': ordering,
        '$filter': 'minimumQuantity gt 1', '$select': fields,
        '$expand': 'item($select=no,baseUnitOfMeasure,vATPostingGroup),itemUnitOfMeasure($select=code,qtyPerUnitOfMeasure)',
      });
      const data = await get(`${root}/itemSalesPrice?${query}`);
      if (!Array.isArray(data.value)) throw new Error('invalid_bc_price_response');
      prices.push(...data.value);
      if (data.value.length < pageSize) { complete = true; break; }
    }
    if (!complete) throw new Error('bc_prices_pagination_incomplete');
    const excluded = { restrictedCustomer: 0, currencyOrVariant: 0, otherSellingUnit: 0, zeroPrice: 0 };
    const eligible = prices.filter(price => {
      if (price.salesType !== 'All_x0020_Customers' || price.salesCode) { excluded.restrictedCustomer++; return false; }
      if (price.variantCode || !['', 'KES'].includes(price.currencyCode)) { excluded.currencyOrVariant++; return false; }
      if (!price.item || (price.unitOfMeasureCode && price.unitOfMeasureCode !== price.item.baseUnitOfMeasure) ||
        (price.itemUnitOfMeasure && Number(price.itemUnitOfMeasure.qtyPerUnitOfMeasure) !== 1)) { excluded.otherSellingUnit++; return false; }
      // Incomplete zero-price records must not turn a wholesale selection into a free order.
      if (price.unitPrice === 0) { excluded.zeroPrice++; return false; }
      return true;
    });
    let vatRows: VatRow[] = [];
    if (eligible.some(price => !price.priceIncludesVAT)) {
      const response = await get(`${root}/vatPostingSetup?$top=1000&$select=vatBusPostingGroup,vatProdPostingGroup,vat`);
      if (!Array.isArray(response.value) || response.value.length >= 1000) throw new Error('invalid_bc_vat_response');
      vatRows = response.value;
    }
    const grouped = new Map<string, Record<string, unknown>[]>();
    for (const price of eligible) {
      if (!price.itemNo || !Number.isFinite(price.minimumQuantity) || price.minimumQuantity <= 1 ||
        !Number.isFinite(price.unitPrice) || price.unitPrice <= 0) throw new Error('invalid_bc_price_rule');
      let unitPrice = price.unitPrice;
      if (!price.priceIncludesVAT) {
        const rates = [...new Set(vatRows.filter(row => row.vatProdPostingGroup === price.item!.vATPostingGroup).map(row => Number(row.vat)))];
        // Never guess the customer's VAT business group or hardcode a tax rate.
        if (rates.length !== 1 || !Number.isFinite(rates[0]) || rates[0] < 0) throw new Error('ambiguous_bc_vat_rule');
        unitPrice *= 1 + rates[0] / 100;
      }
      const startsOn = unlimitedDate(price.startingDate);
      const endsOn = unlimitedDate(price.endingDate);
      if ([startsOn, endsOn].some(date => date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) ||
        (startsOn && endsOn && startsOn > endsOn)) throw new Error('invalid_bc_price_dates');
      const tier = { minQty: price.minimumQuantity, unitPrice: Math.round(unitPrice * 100) / 100,
        startsOn, endsOn, uom: price.item!.baseUnitOfMeasure };
      grouped.set(price.itemNo, [...(grouped.get(price.itemNo) ?? []), tier]);
    }
    const snapshot = [...grouped].map(([item_no, tiers]) => ({ item_no, tiers }));
    const body = await request.json().catch(() => ({}));
    if (body.dryRun === true) return Response.json({ dryRun: true, fetched: prices.length, eligible: eligible.length, products: snapshot.length, excluded });
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data, error } = await db.rpc('replace_bc_wholesale_tiers', { p_rows: snapshot, p_started_at: startedAt });
    if (error) throw new Error('tier_snapshot_write_failed');
    console.log(JSON.stringify({ event: 'bc_wholesale_sync', fetched: prices.length, ...data, excluded }));
    return Response.json({ success: true, fetched: prices.length, ...data, excluded });
  } catch (cause) {
    const error = cause instanceof Error && /^(missing_bc_|bc_|invalid_bc_|ambiguous_bc_|tier_snapshot_)/.test(cause.message)
      ? cause.message : 'wholesale_sync_failed';
    console.error(error);
    return Response.json({ success: false, error }, { status: 502 });
  }
});
