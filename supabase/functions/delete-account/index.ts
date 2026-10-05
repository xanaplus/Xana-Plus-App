import { adminClient, preflight, reply } from '../_shared/otp.ts';

/**
 * POST (signed in) {} → { ok: true }.
 *
 * Deletes the caller's account: their profile, saved addresses and sign-in
 * go with it. Orders stay for the books, detached from the account, with the
 * name and delivery address blanked first.
 */

Deno.serve(async request => {
  const early = preflight(request);
  if (early) return early;

  const db = adminClient();
  const jwt = (request.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: auth } = await db.auth.getUser(jwt);
  const user = auth?.user;
  if (!user) return reply(401, { error: 'signed_out' });

  const { error: scrubError } = await db
    .from('orders')
    .update({ contact: 'Deleted customer', address_line: 'Removed on account deletion', rx_reference: null })
    .eq('user_id', user.id);
  if (scrubError) return reply(500, { error: 'server_error' });

  const { error: deleteError } = await db.auth.admin.deleteUser(user.id);
  if (deleteError) return reply(500, { error: 'server_error' });

  return reply(200, { ok: true });
});
