import { adminClient, preflight, reply } from '../_shared/otp.ts';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * POST { email } → { ok: true } when a Xana Plus account has confirmed the
 * address, else 404 `no_account`. The app's "Continue with email" uses it to
 * send a new address to the sign-up form (Roystone, 29 Oct 2026); it sends
 * nothing itself, the website team's `email-code` function emails the code.
 */
Deno.serve(async request => {
  const early = preflight(request);
  if (early) return early;

  const body = await request.json().catch(() => ({}));
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!EMAIL_PATTERN.test(email) || email.length > 254) return reply(400, { error: 'invalid_email' });

  const { data, error } = await adminClient()
    .from('account_emails').select('user_id').eq('email', email).not('confirmed_at', 'is', null).limit(1).maybeSingle();
  if (error) return reply(500, { error: 'server_error' });
  if (!data) return reply(404, { error: 'no_account' });
  return reply(200, { ok: true, email });
});
