import { adminClient, hashCode, isDemoPhone, normalizePhone, preflight, reply } from '../_shared/otp.ts';

/**
 * POST { phone, code } → checks the code and returns a real Supabase session
 * { access_token, refresh_token }. First sign-in on a phone creates the
 * customer's account and Xana Club profile.
 */
Deno.serve(async request => {
  const early = preflight(request);
  if (early) return early;

  const body = await request.json().catch(() => ({}));
  const phone = normalizePhone(body.phone);
  const code = typeof body.code === 'string' ? body.code.trim() : '';
  if (!phone || !/^\d{6}$/.test(code)) return reply(400, { error: 'wrong_code' });

  const db = adminClient();
  const demo = isDemoPhone(phone);

  if (demo) {
    if (code !== Deno.env.get('DEMO_CODE')) return reply(400, { error: 'wrong_code' });
  } else {
    const { data: consumed, error } = await db.rpc('consume_otp', {
      p_phone: phone, p_code_hash: await hashCode(phone, code),
    });
    if (error) return reply(500, { error: 'server_error' });
    if (['expired', 'wrong_code', 'too_many_attempts'].includes(consumed?.error)) {
      return reply(400, { error: consumed.error });
    }
    if (consumed?.ok !== true) return reply(500, { error: 'server_error' });
  }

  // Supabase Auth has no Africa's Talking phone provider, so each phone gets a
  // placeholder email that is never mailed; a server-side magic link then
  // mints the session for it.
  const email = `${phone.slice(1)}@phone.xanalife.com`;
  const { error: createError } = await db.auth.admin.createUser({ email, email_confirm: true, phone, phone_confirm: true });
  if (createError && createError.status !== 422) return reply(500, { error: 'server_error' });

  const { data: link, error: linkError } = await db.auth.admin.generateLink({ type: 'magiclink', email });
  if (linkError || !link.user) return reply(500, { error: 'server_error' });

  const { error: profileError } = await db.from('profiles').upsert(
    demo
      ? { id: link.user.id, phone, name: 'Amina Odhiambo', club_tier: 'Gold', club_points: 2480 }
      : { id: link.user.id, phone },
    { onConflict: 'id', ignoreDuplicates: true },
  );
  if (profileError) return reply(500, { error: 'server_error' });

  const { data: verified, error: sessionError } = await db.auth.verifyOtp({
    token_hash: link.properties.hashed_token,
    type: 'magiclink',
  });
  if (sessionError || !verified.session) return reply(500, { error: 'server_error' });

  return reply(200, {
    access_token: verified.session.access_token,
    refresh_token: verified.session.refresh_token,
  });
});
