import { adminClient, preflight, reply } from '../_shared/otp.ts';

/**
 * POST (signed in) { lines: [{ itemNo, quantity }], paymentMethod, contact,
 * addressLine, slotLabel, storeName, substitution, pointsRedeemed,
 * ageConfirmed, rxSupplied, rxReference?, promoCode? } → { orderNo, ... }.
 *
 * Every line is re-priced from the catalogue here; the app's prices are never
 * trusted. Orders are saved as test orders (is_test, payment 'simulated')
 * until M-Pesa is real. Points spent are taken off here; points earned are
 * added by staff_set_order_status() when the order is delivered. A promo code
 * is re-checked by promo_quote() against this subtotal and comes off the items.
 */

const PLATFORM_FEE = 20;
const DELIVERY_FEE = 0;
/** 10 points = KES 1 off. */
const POINTS_PER_KES = 10;
/** D-5: 1 point per KES 120 paid. */
const KES_PER_POINT_EARNED = 120;
const MAX_LINES = 100;
const MAX_QUANTITY = 999;

const PAYMENT_METHODS = ['mpesa', 'cod', 'card'];
const SUBSTITUTIONS = ['similar', 'refund', 'call'];

type Line = { itemNo: string; quantity: number };

const text = (value: unknown, max = 300): string | null =>
  typeof value === 'string' && value.trim() !== '' ? value.trim().slice(0, max) : null;

const newOrderNo = () => `XN-${1000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 9000)}`;

Deno.serve(async request => {
  const early = preflight(request);
  if (early) return early;

  const db = adminClient();
  const jwt = (request.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: auth } = await db.auth.getUser(jwt);
  const user = auth?.user;
  if (!user) return reply(401, { error: 'signed_out' });

  const body = await request.json().catch(() => ({}));
  const lines: Line[] = Array.isArray(body.lines)
    ? body.lines.filter(
        (line: Line) =>
          typeof line?.itemNo === 'string' && Number.isInteger(line.quantity) && line.quantity > 0 && line.quantity <= MAX_QUANTITY,
      )
    : [];
  const paymentMethod = text(body.paymentMethod);
  const substitution = text(body.substitution);
  const contact = text(body.contact);
  const addressLine = text(body.addressLine);
  const slotLabel = text(body.slotLabel);
  const storeName = text(body.storeName);
  const pointsRedeemed = Number.isInteger(body.pointsRedeemed) && body.pointsRedeemed > 0 ? body.pointsRedeemed : 0;
  const promoCode = text(body.promoCode, 30)?.toUpperCase() ?? null;

  if (
    lines.length === 0 ||
    lines.length > MAX_LINES ||
    lines.length !== (body.lines?.length ?? 0) ||
    !paymentMethod || !PAYMENT_METHODS.includes(paymentMethod) ||
    !substitution || !SUBSTITUTIONS.includes(substitution) ||
    !contact || !addressLine || !slotLabel || !storeName
  ) {
    return reply(400, { error: 'invalid_order' });
  }

  // Price and check every line against the catalogue as it is now.
  const itemNos = [...new Set(lines.map(line => line.itemNo))];
  const { data: rows, error: catalogueError } = await db
    .from('catalogue')
    .select('item_no, name, price, stock, requires_rx, age_restricted')
    .in('item_no', itemNos);
  if (catalogueError) return reply(500, { error: 'server_error' });

  const byNo = new Map((rows ?? []).map(row => [row.item_no as string, row]));
  const unavailable = itemNos.filter(no => {
    const row = byNo.get(no);
    return !row || Number(row.stock) <= 0;
  });
  if (unavailable.length > 0) return reply(409, { error: 'unavailable', items: unavailable });

  const items = lines.map(line => {
    const row = byNo.get(line.itemNo)!;
    const unitPrice = Number(row.price);
    return {
      item_no: line.itemNo,
      name: row.name ?? line.itemNo,
      unit_price: unitPrice,
      quantity: line.quantity,
      line_total: unitPrice * line.quantity,
      requires_rx: row.requires_rx === true,
      age_restricted: row.age_restricted === true,
    };
  });

  if (items.some(item => item.age_restricted) && body.ageConfirmed !== true) return reply(400, { error: 'age_unconfirmed' });
  // Rx orders are created only by the transaction-bound pharmacist-quote RPC.
  // A client-supplied boolean/reference is never clinical approval.
  if (items.some(item => item.requires_rx)) return reply(400, { error: 'rx_missing' });

  const itemsSubtotal = items.reduce((sum, item) => sum + item.line_total, 0);

  let promoDiscount = 0;
  if (promoCode) {
    const { data: quote, error: promoError } = await db.rpc('promo_quote', { p_code: promoCode, p_user: user.id, p_subtotal: itemsSubtotal });
    if (promoError) return reply(500, { error: 'server_error' });
    if (quote?.error) return reply(400, { error: quote.error, minSpend: quote.min_spend });
    promoDiscount = Number(quote.discount);
  }

  const total = itemsSubtotal - promoDiscount + DELIVERY_FEE + PLATFORM_FEE;

  const { data: profile } = await db.from('profiles').select('club_points').eq('id', user.id).maybeSingle();
  const maxRedeemable = Math.min(profile?.club_points ?? 0, Math.floor(total * POINTS_PER_KES));
  if (pointsRedeemed > maxRedeemable) return reply(400, { error: 'points_unavailable' });

  const amountDue = Math.max(0, total - pointsRedeemed / POINTS_PER_KES);
  const pointsEarned = Math.floor(amountDue / KES_PER_POINT_EARNED);

  // Four-digit numbers match the app's "XN-2481" style; retry on the rare clash.
  let order: { id: string; order_no: string; created_at: string } | null = null;
  for (let attempt = 0; attempt < 5 && !order; attempt++) {
    const { data, error } = await db
      .from('orders')
      .insert({
        order_no: newOrderNo(),
        user_id: user.id,
        is_test: true,
        payment_method: paymentMethod,
        payment_status: 'simulated',
        contact,
        address_line: addressLine,
        slot_label: slotLabel,
        store_name: storeName,
        substitution,
        items_subtotal: itemsSubtotal,
        promo_code: promoCode,
        promo_discount: promoDiscount,
        delivery_fee: DELIVERY_FEE,
        platform_fee: PLATFORM_FEE,
        total,
        points_redeemed: pointsRedeemed,
        amount_due: amountDue,
        points_earned: pointsEarned,
        age_confirmed: body.ageConfirmed === true,
        rx_reference: text(body.rxReference, 60),
      })
      .select('id, order_no, created_at')
      .single();
    if (data) order = data;
    else if (error?.code !== '23505') return reply(500, { error: 'server_error' });
  }
  if (!order) return reply(500, { error: 'server_error' });

  const { error: itemsError } = await db.from('order_items').insert(items.map(item => ({ ...item, order_id: order!.id })));
  if (itemsError) {
    // No multi-statement transactions through PostgREST: undo the header so no empty order is left behind.
    await db.from('orders').delete().eq('id', order.id);
    return reply(500, { error: 'server_error' });
  }

  // Points spent come off the balance now (only if it still holds them); points
  // earned are added when staff mark the order delivered.
  if (pointsRedeemed > 0) {
    const { data: spent } = await db.rpc('spend_club_points', { p_user: user.id, p_points: pointsRedeemed });
    if (spent !== true) {
      await db.from('orders').delete().eq('id', order.id);
      return reply(400, { error: 'points_unavailable' });
    }
  }

  return reply(200, {
    orderNo: order.order_no,
    createdAt: order.created_at,
    itemsSubtotal,
    promoDiscount,
    deliveryFee: DELIVERY_FEE,
    platformFee: PLATFORM_FEE,
    total,
    amountDue,
    pointsEarned,
  });
});
