import {
  adminClient,
  hashCode,
  isDemoPhone,
  newCode,
  normalizePhone,
  preflight,
  reply,
} from '../_shared/otp.ts';

/**
 * POST { phone } → sends a six-digit sign-in code by SMS through Africa's
 * Talking. The code is stored hashed and is never returned to the app.
 */
Deno.serve(async request => {
  const early = preflight(request);
  if (early) return early;

  const body = await request.json().catch(() => ({}));
  const phone = normalizePhone(body.phone);
  if (!phone) return reply(400, { error: 'invalid_phone' });
  if (isDemoPhone(phone)) return reply(200, { ok: true, phone });

  const db = adminClient();
  const code = newCode();
  const { data: reservation, error: reserveError } = await db.rpc('reserve_otp', {
    p_phone: phone, p_code_hash: await hashCode(phone, code),
  });
  if (reserveError) return reply(500, { error: 'server_error' });
  if (reservation?.error === 'too_soon' || reservation?.error === 'too_many') {
    return reply(429, { error: reservation.error });
  }
  if (!reservation?.id) return reply(500, { error: 'server_error' });

  const sent = await sendSms(phone, `Your Xana Plus code is ${code}. It expires in 5 minutes. Never share it with anyone.`);
  const { data: delivery, error: deliveryError } = await db.rpc('finish_otp_delivery', {
    p_phone: phone, p_id: reservation.id, p_sent: sent === 'Success',
  });
  if (deliveryError || delivery?.ok !== true) return reply(500, { error: 'server_error' });
  if (sent !== 'Success') {
    // The customer has opted out of promotional SMS at the network (Do Not Disturb), so the app can say why.
    if (sent === 'UserInBlacklist') return reply(422, { error: 'sms_blocked' });
    if (sent === 'InvalidPhoneNumber') return reply(400, { error: 'invalid_phone' });
    return reply(502, { error: 'sms_failed' });
  }
  return reply(200, { ok: true, phone });
});

/**
 * Africa's Talking SMS API; the `sandbox` username routes to the dashboard simulator.
 * Returns the recipient status ('Success', 'UserInBlacklist', ...) or null when there was no usable reply.
 */
async function sendSms(to: string, message: string): Promise<string | null> {
  const username = Deno.env.get('AFRICASTALKING_USERNAME') ?? 'sandbox';
  const apiKey = Deno.env.get('AFRICASTALKING_API_KEY') ?? '';
  const host = username === 'sandbox' ? 'api.sandbox.africastalking.com' : 'api.africastalking.com';
  const params = new URLSearchParams({ username, to, message });
  const senderId = Deno.env.get('AFRICASTALKING_SENDER_ID');
  if (senderId) params.set('from', senderId);

  try {
    const response = await fetch(`https://${host}/version1/messaging`, {
      method: 'POST',
      headers: { apiKey, Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
    });
    if (!response.ok) {
      console.error('Africa\'s Talking HTTP', response.status, await response.text());
      return null;
    }
    const result = await response.json();
    const status = result?.SMSMessageData?.Recipients?.[0]?.status;
    if (status !== 'Success') console.error('Africa\'s Talking rejected the message', JSON.stringify(result));
    return typeof status === 'string' ? status : null;
  } catch (error) {
    console.error('Africa\'s Talking unreachable', error);
    return null;
  }
}
