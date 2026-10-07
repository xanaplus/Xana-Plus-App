# Prescription journey verification

## Handoff status — 2026-10-07

**Prepared for local testing, not fully verified end to end.** The owner explicitly
chose to apply the current changes to the main project and track unfinished checks
separately. Signed-in customer/pharmacist browser checks, real private storage
verification and native device camera/gallery checks remain outstanding and must
not be described as passing. The previously supplied test OTP did not authenticate
the no-SMS demo account. It was not guessed or retried, and no real SMS was requested.

Offline and rollback-only results below were obtained on 2026-10-06. The later
GitHub/local-Expo handoff changed no app behavior, test fixtures or test assertions.

## Apply and push for local Expo testing

The current changes are committed in the task workspace. Attempts to push from
this workspace failed authentication even after the owner's GitHub reconnection;
no successful push is claimed.

The task-view Git pane intentionally cannot sync with a remote. Once this task
is ready, use **Apply changes to main version**, then open the main **Xana-Plus-App**
project, open its Git pane, and push from there. Consult current Replit documentation
if those labels change. Local installation and the client-only `.env` configuration
are documented under **Fresh local checkout** in `DEVELOPER_GUIDE.md`.

## Checks completed

### Isolated screen and adapter tests

`npm run test:backend` — all 108 tests passed, including 24 new prescription tests.
Authentication, backend, image picker and native rendering boundaries are mocked.
These are **not live backend or browser end-to-end verification**.

- Camera/gallery permission selection, denied access and picker cancellation.
- Image selection/removal, unsupported formats, oversized and empty file rejection.
- Owner/draft upload prefix, non-overwrite uploads and five-minute signed URL calls.
- Failed upload does not attach; failed attachment requests object cleanup.
- Partial upload retains the draft and retries only unsuccessful images.
- Signed-out submission retains details/photos without creating a request.
- Exact displayed item price, quantity and subtotal; simulated-payment disclosure.
- Explicit confirmation and immediate duplicate-click guard.
- Changed stock/price and refreshed-quote error messages; expired quote disabled.
- Clarification reply and refresh back to pharmacist review.
- Cancellation confirmation, keeping the request, and removal of checkout on cancel.
- Ordinary customer denial of the pharmacist editor.
- Pharmacist clarification/hold/decline with mandatory reasons.
- Quote submission uses item IDs, quantities and instructions, not client prices.
- Existing prescription and successful order navigation.

`npm run typecheck` and `npm run lint` passed.

### Connected database, rollback-only

`node scripts/tests/prescription-db.mjs` passed against the existing Supabase project.
It executes only `scripts/tests/prescription-first.sql`, which starts with `BEGIN`
and ends in `ROLLBACK`; the runner rejects `COMMIT`.

Fixtures contain synthetic accounts, temporary pharmacist membership, catalogue
products and file **metadata**, not uploaded objects. Existing designated
pharmacist membership is unchanged. Synthetic price/stock updates affect only the
uncommitted fixture items; no real catalogue stock or prices are changed.

Verified consent/photo requirements, owner isolation, reviewer access and blocked
self-escalation, clarification, hold, decline, cancellation, restricted medicines,
changed catalogue prices, insufficient stock, expiry and stale displayed quote
version rejection, exact persisted quote lines and totals, audit history,
reference-only prescription ordering/dispatch restrictions, and anonymous denial.

Repeated confirmation returned the same order and left one order row. The
synthetic quote subtotal was KSh 246.90 and persisted total KSh 266.90 including
the existing KSh 20 fee. Test/simulated payment flags and zero points redeemed or
earned were asserted. All database fixture changes were rolled back.
This checks sequential repeated confirmation, not concurrent live browser clients.

### Preview

The managed XanaPlus web workflow runs on port 5000. The signed-out upload route
renders at phone viewport size, with private-upload explanation, camera/gallery
actions, patient fields, consent and sign-in requirement. No auth bypass was added.
Signed-in screens were not visually verified.

## Remaining checks and safe continuation

The owner subsequently approved attempting temporary no-SMS test accounts using
the existing backend access, while preserving the original pharmacist membership.
`scripts/tests/prescription-live.mjs` prepares that alternative with an explicit
`--approved-temporary-no-sms` opt-in. **It has not been run.** Its syntax and lint
checks do not establish that its live verification steps pass. The owner asked
to push the changes to GitHub for local Expo testing before that live run.

The runner creates synthetic confirmed-email/password accounts without invoking
OTP or sending messages, grants reviewer membership only to its synthetic reviewer,
and tests signed-in screens against real APIs. Deliberately aborted network calls
test retries; they are not treated as backend failures. It removes test images and
temporary reviewer access afterward. If an order is created, it retains the
labelled simulated order and disables its synthetic customer account for audit
rather than deleting orders. No sessions, passwords or admin credentials are
written to disk.

The preferred follow-up is the owner-approved temporary-account approach above;
first verify the unrun harness and its cleanup before relying on its results.
The demo-code/session instructions below are an alternative only if approved
demo access becomes available. Do not ask the owner to obtain tokens they do not
have when the already-approved synthetic-account approach is feasible.

1. Request the configured fixed no-SMS **demo** code as
   `XANAPLUS_TEST_DEMO_CODE` through secure secret tooling;
   do not reuse an OTP intended for a real recipient, guess codes, or call
   `request-otp`. The storage script verifies the demo code directly and never
   requests SMS.
2. Run `node scripts/tests/prescription-storage.mjs` using approved demo access.
   Verify real bytes upload/attachment, signed URL read, public URL denial and
   cleanup. It leaves a clearly labelled cancelled synthetic draft, not an order.
3. Obtain approved no-SMS session access for the **existing owner-designated
   pharmacist** through secure tooling. Do not grant reviewer access to the
   customer demo account or replace the existing membership.
4. Test actual signed-in customer/reviewer screens with synthetic, nonclinical
   images and notes: submission/retry, clarification, hold/decline, exact quote,
   confirm/cancel and existing order navigation. Any persisted order must remain
   labelled DO NOT FULFIL, test/simulated and without loyalty redemption.
5. On an Android/iOS test device, verify real camera and gallery permission,
   cancellation, selection and upload. Web preview and mocked picker tests do not
   establish native behavior.

No new live prescription drafts, stored objects or orders were created in this
verification session. No migration, Edge Function deployment, SMS configuration,
payment-provider operation or shared account setting change was performed.
