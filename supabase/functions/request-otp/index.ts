import {
  CODE_TTL_MS,
  MAX_CODES_PER_HOUR,
  RESEND_AFTER_MS,
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
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data: recent, error: recentError } = await db
    .from('otp_codes')
    .select('created_at')
    .eq('phone', phone)
    .gte('created_at', hourAgo)
    .order('created_at', { ascending: false });
  if (recentError) return reply(500, { error: 'server_error' });

  if (recent.length > 0 && Date.now() - new Date(recent[0].created_at).getTime() < RESEND_AFTER_MS) {
    return reply(429, { error: 'too_soon' });
  }
  if (recent.length >= MAX_CODES_PER_HOUR) return reply(429, { error: 'too_many' });

  const code = newCode();
  const { data: row, error: insertError } = await db
    .from('otp_codes')
    .insert({ phone, code_hash: await hashCode(phone, code), expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString() })
    .select('id')
    .single();
  if (insertError) return reply(500, { error: 'server_error' });

  const sent = await sendSms(phone, `Your Xana Plus code is ${code}. It expires in 5 minutes. Never share it with anyone.`);
  if (sent !== 'Success') {
    await db.from('otp_codes').delete().eq('id', row.id);
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
