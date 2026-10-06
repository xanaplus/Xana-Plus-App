# Customer backend verification

Verified on 2026-10-06 against the existing connected Supabase backend.
No database replacement, migrations, Edge Function deployments, authentication bypass,
or payment-provider calls were used. Credentials and server-issued session tokens were
kept in memory and excluded from output.

## Live checks passed

- Public catalogue shelves and free-text search returned HTTP 200 and stocked products,
  using the same selection and ordering fields as the app.
- Invalid phone input returned `invalid_phone`; malformed verification input returned
  `wrong_code`. An unauthenticated `place-order` call returned `signed_out` (HTTP 401).
- The existing documented demo sign-in endpoint returned a real Supabase session,
  accepted by `auth.setSession`. This uses the server's existing demo flow, with no
  client-side or server-side authentication changes.
- The authenticated customer could read their profile. Writing the same existing name
  and preferences succeeded and returned the matching row. A fresh client restored
  the session from an isolated persistence adapter and read the same profile values.
  No shared demo account settings or personal data were changed.
- One unrestricted, stocked catalogue item was ordered with COD, no promo and no
  points redemption. The persisted header was `is_test=true`,
  `payment_status=simulated`, with one matching order item.
- Saved subtotal matched the live catalogue price, and total matched subtotal plus the
  existing KES 20 platform fee. A second client reload could read the same header/lines.
- Local sign-out cleared persisted authentication.
- With an explicitly approved controlled test recipient, Africa's Talking accepted
  a real SMS. The immediate resend returned HTTP 429 `too_soon` without another SMS.
  The recipient supplied the delivered code through a secure secret form; `verify-otp`
  returned HTTP 200 and real access/refresh tokens. A fresh client restored that
  real customer's session, profile and unchanged saved preferences. Its owner-filtered
  order query succeeded, and local sign-out cleared its stored tokens.
- Reusing the consumed real code returned HTTP 400 `expired` and no session.

**Test data:** one test-only COD order remains in the existing demo account. Its contact
and fulfilment fields explicitly say `TEST ONLY` / `DO NOT FULFIL`. The customer API
forbids deletion, so cleanup was not attempted using privileged credentials. It must not
be dispatched. No payment, points redemption or fulfilment status change was made.
The one approved real SMS check did not place any orders on the real customer's account.
The used code is invalid after successful verification. Its temporary
`XANAPLUS_TEST_OTP` secret entry still needs deletion through Tools > Secrets; the
environment-variable deletion operation does not remove that secret entry.

## Focused offline regressions

Run `npm run test:backend`. Coverage includes:

- Legacy/unowned and different-account order caches stay hidden, including offline.
- Customer queries explicitly filter by user ID, even if staff RLS permits wider reads.
- Signing out or switching accounts prevents a delayed old-account response from
  restoring private profile/order data.
- Successful placement persists server totals and the test-order flag across remount.
- Signed-out placement makes no function call; server order rejection details survive.
- Cached profiles are not treated as authenticated.
- Profile name updates are awaited, normalized, and scoped to the correct customer.
- OTP client errors, malformed replies and network failures remain explicit.
- Real request/verify handlers reject invalid input, recent resends, five retained
  hourly codes, expired codes, and verification after five wrong attempts.

## Remaining limitations

- The signed-in UI was not visually verified; the screenshot browser cannot sign in.
  Signed-in behavior was checked through live API requests and isolated store tests.
- Native storage, camera, push, and Android/iOS builds are outside these web/API checks.
- OTP rate-limit tests cover sequential handler behavior only. The current hourly
  count uses retained code rows, which are deleted on verification or failed delivery;
  it is not a durable send-attempt history. Concurrent requests/verification can also
  race because checking, updating attempts, and consuming codes are separate operations.
  Do not interpret the passing tests as proof of atomic throttling or replay protection.
