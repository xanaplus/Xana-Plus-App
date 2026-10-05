import { createClient } from 'jsr:@supabase/supabase-js@2';

/**
 * Sends a push notification through Expo's push service.
 *
 * Callers prove themselves with the `x-sync-secret` header (the orders trigger
 * reads it from Vault); the function rejects anything without it. Two shapes:
 *   { orderNo, status }                    → looks up the customer and picks the wording
 *   { userIds, title, body, data }         → sends exactly what it is given
 *
 * Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, BC_SYNC_SECRET.
 */
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const MAX_PER_REQUEST = 100;

/** The order states worth telling the customer about, and what they read. */
const ORDER_MESSAGES: Record<string, { title: string; body: string }> = {
  received: {
    title: 'Order received',
    body: 'We have your order. Our pharmacy team is reviewing it now.',
  },
  shopping: {
    title: 'Being packed',
    body: 'A shopper is picking your items. We will let you know when it is on the way.',
  },
  'out-for-delivery': {
    title: 'Out for delivery',
    body: 'Your rider is on the way. Keep your phone nearby.',
  },
  delivered: {
    title: 'Delivered',
    body: 'Enjoy! Your Xana Club points have been added.',
  },
  cancelled: {
    title: 'Order cancelled',
    body: 'This order was cancelled. Any points you used have been returned.',
  },
};

Deno.serve(async request => {
  if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const expected = Deno.env.get('BC_SYNC_SECRET');
  if (!expected || request.headers.get('x-sync-secret') !== expected) {
    return json(403, { error: 'forbidden' });
  }

  const body = await request.json().catch(() => ({}));
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let userIds: string[] = Array.isArray(body.userIds)
    ? body.userIds.filter((value: unknown): value is string => typeof value === 'string')
    : [];
  let title = typeof body.title === 'string' ? body.title : '';
  let message = typeof body.body === 'string' ? body.body : '';
  const data: Record<string, unknown> =
    typeof body.data === 'object' && body.data !== null ? { ...body.data } : {};

  if (typeof body.orderNo === 'string') {
    const { data: order } = await db
      .from('orders')
      .select('user_id, order_no, status')
      .eq('order_no', body.orderNo)
      .maybeSingle();
    if (!order?.user_id) return json(200, { skipped: 'no_customer' });

    const status = typeof body.status === 'string' ? body.status : order.status;
    const copy = ORDER_MESSAGES[status];
    if (!copy) return json(200, { skipped: 'no_message' });

    userIds = [order.user_id];
    title = copy.title;
    message = copy.body;
    data.route = `/orders/${order.order_no}`;
    data.status = status;
  }

  if (userIds.length === 0 || !title) return json(400, { error: 'nothing_to_send' });

  const { data: rows, error } = await db.from('push_tokens').select('token').in('user_id', userIds);
  if (error) return json(500, { error: 'server_error' });

  const tokens = [...new Set((rows ?? []).map(row => row.token as string))];
  if (tokens.length === 0) return json(200, { sent: 0, pruned: 0 });

  let sent = 0;
  const dead: string[] = [];

  for (let start = 0; start < tokens.length; start += MAX_PER_REQUEST) {
    const chunk = tokens.slice(start, start + MAX_PER_REQUEST);
    const messages = chunk.map(to => ({ to, title, body: message, data, sound: 'default' }));
    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(messages),
    });
    if (!response.ok) {
      console.error('Expo push HTTP', response.status, await response.text());
      continue;
    }
    const result = await response.json();
    const tickets: { status?: string; details?: { error?: string } }[] = Array.isArray(result?.data)
      ? result.data
      : [];
    tickets.forEach((ticket, index) => {
      if (ticket?.status === 'ok') sent += 1;
      else if (ticket?.details?.error === 'DeviceNotRegistered') dead.push(chunk[index]);
    });
  }

  // Uninstalled or signed-out devices answer DeviceNotRegistered; drop them.
  if (dead.length > 0) await db.from('push_tokens').delete().in('token', dead);

  return json(200, { sent, pruned: dead.length });
});

function json(status: number, payload: Record<string, unknown>): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
