import { adminClient, preflight, reply } from '../_shared/otp.ts';
import { cleanKraPin } from '../../../src/lib/kra-pin.ts';
import { lineTotal, quantityUnitPrice } from '../../../src/lib/quantity-pricing.ts';
import { activeOffer, parseOffers } from '../../../src/lib/branch-offers.ts';

/**
 * POST (signed in) { lines: [{ itemNo, quantity }], paymentMethod, contact,
 * addressLine, slotLabel, storeName, branchCode?, substitution, pointsRedeemed,
 * ageConfirmed, rxSupplied, rxReference?, promoCode?, kraPin? } → { orderNo, ... }.
 *
 * Every line is re-priced from the catalogue here; the app's prices are never
 * trusted. Orders are saved as test orders (is_test, payment 'simulated')
 * until M-Pesa is real. Points spent are taken off here; points earned are
 * added by staff_set_order_status() when the order is delivered. A promo code
 * is re-checked by promo_quote() against this subtotal and comes off the items.
 *
 * Orders leave from the store the customer picked (owner, 15 Oct 2026): it is saved
 * as branch_code (BC posting needs a location) and stock is checked at that branch.
 * App builds before this send only storeName, so the branch is read from it.
 *
 * Prescription medicines (owner, 29 Oct 2026): sent with `prescriptionId` (the
 * customer's own draft prescription, photos attached), the order goes through the
 * shared create_order() as the website's do. It then waits for a pharmacist in the
 * admin app (awaiting-approval) and the customer confirms what was approved. Every
 * other order is saved here as before (owner, 23 Oct: keep this function until DPO).
 *
 * Pay online (`dpo`, owner 19 Nov 2026): the order also goes through create_order(),
 * which saves it awaiting-payment (30 minutes, stock held); the app then opens DPO's
 * page through the shared `dpo` function. Real money: DPO is live. Only staff,
 * pharmacist and admin accounts may use it until the APP_PAY_ONLINE secret is `all`.
 * It is a test order only while the shop's online payment switch is off, as on the website.
 *
 * Pay at pickup (`counter`, Play release check 20 Nov 2026): the app is pickup only for
 * now, and its cash orders go through create_order() as the website's pay-at-pickup
 * orders do, so the branch sees them as real orders (the old direct save below marked
 * every one a test order, which the admin app hides). Staff, pharmacist and admin
 * accounts still place test orders. create_order() applies the shop's switches
 * (checkout_enabled, pay_at_pickup_enabled) and its pay-at-pickup limits.
 *
 * Door delivery by distance (owner, 17 Nov 2026; the app's version 21 Nov): an order
 * sent with fulfilment 'delivery' needs `deliveryQuoteId`, a quote the shared
 * web-checkout function saved for this customer and branch (action 'locate', from a
 * typed address or a point). The fee is worked out here from that quote's road
 * distance by web_order_fees(), as the website's, never taken from the app. Delivery
 * is paid online, as on the website. create_order() does not read quotes on app
 * orders, so it gets the fee, and the place is written on the order afterwards.
 */

/** No packaging fee (owner, 15 Oct 2026); the field stays so past orders still show theirs. */
const PLATFORM_FEE = 0;
const DELIVERY_FEE = 0;
/** 10 points = KES 1 off. */
const POINTS_PER_KES = 10;
/** D-5: 1 point per KES 120 paid. */
const KES_PER_POINT_EARNED = 120;
const MAX_LINES = 100;
const MAX_QUANTITY = 999;

/** `mpesa` and `card` were the app's simulated payments; refused since 20 Nov 2026. `cod` stays for older app builds. */
const PAYMENT_METHODS = ['cod', 'dpo', 'counter'];
/** Accounts that may pay online before it is open to every customer (as the website's web-checkout). */
const STAFF_ROLES = ['staff', 'pharmacist', 'admin'];
const SUBSTITUTIONS = ['similar', 'refund', 'call'];
/** The app's stores, as stock_locations codes. Syokimau is the app's default store. */
const BRANCHES = ['SYOKIMAU', 'RUIRU'];
const branchFor = (code: string | null, storeName: string | null): string | null => {
  if (code) return BRANCHES.includes(code.toUpperCase()) ? code.toUpperCase() : null;
  return /ruiru/i.test(storeName ?? '') ? 'RUIRU' : 'SYOKIMAU';
};

type Line = { itemNo: string; quantity: number; expectedUnitPrice?: number };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** create_order() refusals passed on to the app as they are; anything else is a server error. */
const SHARED_ERRORS = [
  'quote_expired', 'unavailable', 'rx_missing', 'not_sold_online', 'age_unconfirmed', 'points_unavailable', 'invalid_branch', 'price_mismatch', 'invalid_order',
  'checkout_off', 'pay_at_pickup_off', 'pay_at_pickup_max', 'pay_at_pickup_limit',
];

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
  const storeName = text(body.storeName);
  const branchCode = branchFor(text(body.branchCode, 20), storeName);
  // Only an order paid online or at pickup is saved as pickup; older app builds' cash orders stay delivery.
  const pickup = body.fulfilment === 'pickup';
  // A pickup order has no delivery address or slot: create_order() writes the branch and "Pickup".
  const addressLine = text(body.addressLine) ?? (pickup ? storeName : null);
  const slotLabel = text(body.slotLabel) ?? (pickup ? 'Pickup' : null);
  const pointsRedeemed = Number.isInteger(body.pointsRedeemed) && body.pointsRedeemed > 0 ? body.pointsRedeemed : 0;
  const promoCode = text(body.promoCode, 30)?.toUpperCase() ?? null;
  // Only builds with delivery by distance send fulfilment 'delivery'; older ones send none.
  const doorDelivery = body.fulfilment === 'delivery';
  const deliveryQuoteId = typeof body.deliveryQuoteId === 'string' && UUID.test(body.deliveryQuoteId) ? body.deliveryQuoteId : null;

  if (
    lines.length === 0 ||
    lines.length > MAX_LINES ||
    lines.length !== (body.lines?.length ?? 0) ||
    new Set(lines.map(line => line.itemNo)).size !== lines.length ||
    !paymentMethod || !PAYMENT_METHODS.includes(paymentMethod) ||
    !substitution || !SUBSTITUTIONS.includes(substitution) ||
    !contact || !addressLine || !slotLabel || !storeName || !branchCode ||
    (paymentMethod === 'counter' && !pickup) ||
    (doorDelivery && paymentMethod !== 'dpo')
  ) {
    return reply(400, { error: 'invalid_order' });
  }
  if (doorDelivery && !deliveryQuoteId) return reply(400, { error: 'quote_missing' });

  // Price and check every line against the catalogue as it is now, with stock at the
  // chosen branch (the total across branches until that branch's first stock sync).
  const itemNos = [...new Set(lines.map(line => line.itemNo))];
  const { data: rows, error: catalogueError } = await db
    .from('catalogue')
    .select('item_no, name, price, stock, stock_by_location, requires_rx, age_restricted, price_tiers, offers_by_location')
    .in('item_no', itemNos);
  if (catalogueError) return reply(500, { error: 'server_error' });

  const byNo = new Map((rows ?? []).map(row => [row.item_no as string, row]));
  const unavailable = itemNos.filter(no => {
    const row = byNo.get(no);
    const atBranch = row?.stock_by_location?.[branchCode];
    const stock = typeof atBranch === 'number' ? atBranch : Number(row?.stock);
    return !row || stock < lines.find(line => line.itemNo === no)!.quantity;
  });
  if (unavailable.length > 0) return reply(409, { error: 'unavailable', items: unavailable });

  const items = lines.map(line => {
    const row = byNo.get(line.itemNo)!;
    // The branch's POS offer, when one runs, for every quantity (as create_order() charges it, 18 Nov 2026).
    const offer = activeOffer({ price: Number(row.price), offers: parseOffers(row.offers_by_location) }, branchCode);
    const listPrice = quantityUnitPrice(Number(row.price), line.quantity, row.price_tiers ?? []);
    const unitPrice = offer?.price ?? listPrice;
    return {
      // Prices the app may have shown: the offer, or (an app from before offers) the BC / quantity price.
      accepted: [unitPrice, listPrice],
      item_no: line.itemNo,
      name: row.name ?? line.itemNo,
      unit_price: unitPrice,
      quantity: line.quantity,
      line_total: lineTotal(unitPrice, line.quantity),
      requires_rx: row.requires_rx === true,
      age_restricted: row.age_restricted === true,
    };
  });

  // As create_order(): a line priced at the offer or at the BC / quantity price is accepted and
  // charged the offer, so a customer never pays more than shown; any other price is refused.
  if (lines.some((line, index) => line.expectedUnitPrice !== undefined &&
    (!Number.isFinite(line.expectedUnitPrice) || !items[index].accepted.some(price => Math.abs(line.expectedUnitPrice! - price) < 0.005)))) {
    return reply(409, { error: 'price_changed' });
  }

  if (items.some(item => item.age_restricted) && body.ageConfirmed !== true) return reply(400, { error: 'age_unconfirmed' });
  // Prescription medicines only with a prescription the pharmacist will check
  // (create_order() checks it is the caller's own draft with photos).
  // A client-supplied boolean/reference is never clinical approval.
  const prescriptionId = typeof body.prescriptionId === 'string' && UUID.test(body.prescriptionId) ? body.prescriptionId : null;
  const hasRx = items.some(item => item.requires_rx);
  if (hasRx && !prescriptionId) return reply(400, { error: 'rx_missing' });
  if (hasRx && items.some(item => item.requires_rx && item.quantity !== 1)) return reply(400, { error: 'rx_quantity' });

  const itemsSubtotal = items.reduce((sum, item) => sum + item.line_total, 0);
  const wholesaleSavings = Math.round(items.reduce((sum, item) =>
    sum + Math.max(0, Number(byNo.get(item.item_no)!.price) - item.unit_price) * item.quantity, 0) * 100) / 100;

  let promoDiscount = 0;
  if (promoCode) {
    const { data: quote, error: promoError } = await db.rpc('promo_quote', { p_code: promoCode, p_user: user.id, p_subtotal: itemsSubtotal });
    if (promoError) return reply(500, { error: 'server_error' });
    if (quote?.error) return reply(400, { error: quote.error, minSpend: quote.min_spend });
    promoDiscount = Number(quote.discount);
  }

  // The delivery fee from the quote's distance, after any free-delivery threshold (web_order_fees()).
  let deliveryFee = DELIVERY_FEE;
  let quote: { id: string; lat: number; lng: number; location_source: string; location_label: string | null; distance_m: number; distance_source: string } | null = null;
  if (doorDelivery) {
    const { data: row, error: quoteError } = await db
      .from('delivery_quotes')
      .select('id, branch_code, lat, lng, location_source, location_label, distance_m, distance_source, expires_at')
      .eq('id', deliveryQuoteId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (quoteError) return reply(500, { error: 'server_error' });
    if (!row || row.branch_code !== branchCode) return reply(400, { error: 'quote_missing' });
    if (new Date(row.expires_at).getTime() <= Date.now()) return reply(400, { error: 'quote_expired' });
    const { data: fees, error: feeError } = await db.rpc('web_order_fees', {
      p_fulfilment: 'delivery', p_fee_method: null, p_products: itemsSubtotal - promoDiscount, p_rate: null, p_distance_m: row.distance_m,
    });
    const fee = Number(fees?.deliveryFee);
    if (feeError || !Number.isFinite(fee) || fee < 0) return reply(500, { error: 'server_error' });
    deliveryFee = fee;
    quote = row;
  }

  const total = itemsSubtotal - promoDiscount + deliveryFee + PLATFORM_FEE;
  // Optional buyer's KRA PIN for the receipt. A malformed one is dropped, never refused (as the POS and create_order() do).
  const kraPin = cleanKraPin(body.kraPin);

  const { data: profile } = await db.from('profiles').select('club_points, role').eq('id', user.id).maybeSingle();
  const staff = STAFF_ROLES.includes(String(profile?.role ?? ''));
  const payOnline = paymentMethod === 'dpo';
  const payAtPickup = paymentMethod === 'counter';
  if (payOnline && !staff && Deno.env.get('APP_PAY_ONLINE') !== 'all') return reply(403, { error: 'not_available' });
  const maxRedeemable = Math.min(profile?.club_points ?? 0, Math.floor(total * POINTS_PER_KES));
  if (pointsRedeemed > maxRedeemable) return reply(400, { error: 'points_unavailable' });

  const amountDue = Math.max(0, total - pointsRedeemed / POINTS_PER_KES);
  const pointsEarned = Math.floor(amountDue / KES_PER_POINT_EARNED);

  if (hasRx || payOnline || payAtPickup) {
    // The shared order: stock held at the branch, points taken off, the pharmacy texted (rx_review)
    // or, paid at pickup, the branch told (branch_new_order).
    let isTest = true;
    if (payAtPickup) isTest = staff;
    if (payOnline) {
      const { data: setting } = await db.from('settings').select('value').eq('key', 'online_payment_enabled').maybeSingle();
      isTest = staff && setting?.value !== true;
    }
    const { data: created, error: createError } = await db.rpc('create_order', {
      p_user: user.id,
      p_channel: 'app',
      p_order: {
        idempotencyKey: crypto.randomUUID(),
        // Older builds' cash orders stay test orders, like the ones saved below; see isTest above.
        isTest,
        fulfilment: (payOnline || payAtPickup) && pickup ? 'pickup' : 'delivery',
        branchCode,
        storeName,
        paymentMethod,
        contact,
        addressLine,
        slotLabel,
        substitution,
        lines: items.map(item => ({ itemNo: item.item_no, quantity: item.quantity, unitPrice: item.unit_price })),
        promoCode,
        promoDiscount,
        pointsRedeemed,
        pointsEarned,
        deliveryFee,
        platformFee: PLATFORM_FEE,
        ageConfirmed: body.ageConfirmed === true,
        buyerKraPin: kraPin,
        prescriptionId,
      },
    });
    if (createError) {
      const code = SHARED_ERRORS.includes(createError.message) ? createError.message : 'server_error';
      if (code === 'server_error') console.error('create_order failed', createError.message);
      return reply(code === 'unavailable' ? 409 : code === 'server_error' ? 500 : 400, {
        error: code,
        items: code === 'unavailable' && createError.details ? createError.details.split(',') : undefined,
      });
    }
    // Where the rider goes, as the website's delivery orders keep it (create_order() leaves
    // these empty on app orders). The order stands either way.
    if (quote) {
      const { error: placeError } = await db.from('orders').update({
        delivery_lat: quote.lat, delivery_lng: quote.lng, delivery_location_source: quote.location_source,
        delivery_location_label: quote.location_label, delivery_distance_m: quote.distance_m,
        delivery_distance_source: quote.distance_source, delivery_quote_id: quote.id,
      }).eq('order_no', created.orderNo);
      if (placeError) console.error('delivery place not saved', created.orderNo, placeError.message);
    }
    // Tell the customer it arrived, as for other app orders: the "order received" SMS
    // (outbox-send owns the wording) and an app notification, which the status trigger
    // only sends on later changes (approved, received…). The order is saved either way.
    // An order paid online is announced once it is paid (the shared sale effects), not now.
    const { data: saved } = payOnline && !hasRx ? { data: null } : await db.from('orders').select('id').eq('order_no', created.orderNo).maybeSingle();
    if (saved) {
      const { error: smsError } = await db.from('outbox').insert({
        order_id: saved.id,
        kind: 'sms_order_received',
        payload: { orderNo: created.orderNo, amountDue: Number(created.amountDue), paymentMethod, storeName, slotLabel },
      });
      if (smsError) console.error('sms_order_received not queued', created.orderNo, smsError.message);
    }
    const pushSecret = Deno.env.get('BC_SYNC_SECRET');
    let notified = pushSecret ? 'not_sent' : 'no_secret';
    if (pushSecret && created.status !== 'awaiting-payment') {
      try {
        const pushed = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-push`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-sync-secret': pushSecret },
          body: JSON.stringify({ orderNo: created.orderNo, status: created.status }),
        });
        notified = `${pushed.status} ${await pushed.text()}`;
      } catch (error) {
        notified = `failed ${String(error)}`;
      }
    }
    console.log('push', created.orderNo, notified);
    return reply(200, {
      orderNo: created.orderNo,
      status: created.status,
      createdAt: new Date().toISOString(),
      itemsSubtotal: Number(created.itemsSubtotal),
      wholesaleSavings,
      items: items.map(item => ({ itemNo: item.item_no, quantity: item.quantity, unitPrice: item.unit_price, lineTotal: item.line_total })),
      promoDiscount,
      deliveryFee,
      platformFee: PLATFORM_FEE,
      total: Number(created.total),
      amountDue: Number(created.amountDue),
      pointsEarned,
      expiresAt: created.expiresAt ?? null,
      paymentStatus: created.paymentStatus ?? null,
      isTest,
      notified,
    });
  }

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
        branch_code: branchCode,
        substitution,
        items_subtotal: itemsSubtotal,
        wholesale_savings: wholesaleSavings,
        promo_code: promoCode,
        promo_discount: promoDiscount,
        delivery_fee: deliveryFee,
        platform_fee: PLATFORM_FEE,
        total,
        points_redeemed: pointsRedeemed,
        amount_due: amountDue,
        points_earned: pointsEarned,
        age_confirmed: body.ageConfirmed === true,
        rx_reference: text(body.rxReference, 60),
        buyer_kra_pin: kraPin,
      })
      .select('id, order_no, created_at')
      .single();
    if (data) order = data;
    else if (error?.code !== '23505') return reply(500, { error: 'server_error' });
  }
  if (!order) return reply(500, { error: 'server_error' });

  const { error: itemsError } = await db.from('order_items').insert(items.map(({ accepted: _accepted, ...item }) => ({ ...item, order_id: order!.id })));
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

  // A well-formed PIN is saved on the account for the next checkout, as create_order() does;
  // a blank one never removes the saved PIN (that is done on Profile).
  if (kraPin) {
    const { error: pinError } = await db.from('profiles').update({ kra_pin: kraPin }).eq('id', user.id);
    if (pinError) console.error('kra_pin not saved', order.order_no, pinError.message);
  }

  // "Order received" SMS: queued for the website team's outbox-send, which owns the
  // wording. The order is already saved, so a failed queue never fails it.
  const { error: smsError } = await db.from('outbox').insert({
    order_id: order.id,
    kind: 'sms_order_received',
    payload: { orderNo: order.order_no, amountDue, paymentMethod, storeName, slotLabel },
  });
  if (smsError) console.error('sms_order_received not queued', order.order_no, smsError.message);

  return reply(200, {
    orderNo: order.order_no,
    createdAt: order.created_at,
    itemsSubtotal,
    wholesaleSavings,
    items: items.map(item => ({ itemNo: item.item_no, quantity: item.quantity, unitPrice: item.unit_price, lineTotal: item.line_total })),
    promoDiscount,
    deliveryFee,
    platformFee: PLATFORM_FEE,
    total,
    amountDue,
    pointsEarned,
  });
});
