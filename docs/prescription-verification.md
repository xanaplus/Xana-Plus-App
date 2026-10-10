# Prescription journey verification

## Live verification completed — 2026-10-10

**The approved no-SMS web/browser and live-backend checks now pass.** Native
Android/iOS camera and gallery behavior remains unverified. This section supersedes
the deferred-live-check status recorded below; offline mocks are still not live evidence.

### Commands and evidence

- `node scripts/tests/prescription-live.mjs --approved-temporary-no-sms` passed
  against the configured Supabase backend and running Expo web app.
- `node scripts/tests/prescription-db.mjs` passed again using only the fixed
  rollback-only SQL fixture. No migration was deployed.
- `npm run test:backend` passed all 108 isolated tests; `npm run typecheck`,
  `npm run lint`, harness syntax and harness ESLint checks passed.
- A signed-out phone-size screenshot of `/pharmacy/upload` still renders correctly.
  That screenshot does **not** prove signed-in behavior. Signed-in customer and
  temporary reviewer interactions below were exercised by Playwright with real
  backend sessions, not mocked session providers or mocked API responses.

### Live customer and temporary reviewer results

- Created confirmed synthetic email/password accounts using the already configured
  backend access. No OTP request, OTP guessing or SMS was used. Passwords, privileged
  credentials, browser contexts, sessions and signed image URLs stayed ephemeral;
  no session-state files, traces, screenshots containing sessions or credentials
  were saved. All browser Edge Function requests were blocked as a safeguard;
  the successful run asserted that none were attempted.
- Selected a labelled nonclinical PNG through the browser's real gallery/file picker.
  Deliberately aborted the first upload and first submission call. Retrying used
  one draft, two upload attempts and two submission attempts, leaving exactly one
  attached image. These deliberate aborts are retry tests, not backend outages.
- Uploaded real private bytes. Owner signed-URL reads and temporary reviewer
  downloads matched the original bytes exactly. Other-customer and anonymous
  signing/downloads were denied; the public object URL was denied. Cross-customer
  prescription reads returned no records, anonymous record reads were denied,
  and an ordinary signed-in customer could not open the reviewer editor.
- Exercised reviewer clarification, customer reply and persisted response, reviewer
  hold, decline reason, keep-request, and confirmed cancellation. Held, declined
  and cancelled requests were rejected by the order RPC without creating orders;
  held/cancelled screens had no confirmation action.
- Searched the real medicine catalogue by name, added a medicine, increased its
  quantity to two, entered instructions/note/expiry and saved a server-priced quote.
  Customer UI unit price, quantity, item identifier and subtotal matched the saved
  quote. Saved order lines and subtotal matched that quote; total included the
  existing KSh 20 fee.
- Refreshing the quote behind the customer's displayed version produced the
  stale-version error. Altering only the synthetic prescription's price snapshot
  or quantity above current stock produced the price/availability error. No real
  catalogue price or stock was changed. Actual catalogue-change checks remain
  separately evidenced by the rollback-only SQL fixture, not this snapshot test.
- A past expiry date and an over-48-hour review timestamp each disabled browser
  confirmation and caused backend `expired_quote` rejection with no order.
- Explicit customer confirmation, two immediate confirmation clicks, sequential
  repeats and parallel repeats returned one order per request. Two independent
  authenticated clients also issued concurrent **first** confirmations on a
  separate fresh quote: both returned the same order, with only one order saved.
- All orders asserted test/simulated payment, DO NOT FULFIL labels and zero points
  earned/redeemed. No real payment was collected.
- Opened the confirmed order through the app's existing order link without
  reloading the app, and opened an existing prescription from customer history.

### Issues fixed during verification

The unrun harness needed name-based catalogue search, icon-tolerant payment-chip
selection, waits for cancellation responses/dialog closure, and an exact order
heading selector because Expo Router keeps the previous screen mounted but hidden.
It now checks expiry, simultaneous first confirmations, exact image bytes and
post-cleanup absence rather than relying on successful deletion acknowledgements.

Prescription checkout writes through its own RPC rather than the cart's order
writer. The prescription detail screen now refreshes shared order history when
an order number is loaded, so the existing order screen can find the newly saved
order. Offline assertions cover successful refresh and no refresh after a rejected
confirmation; the final live run verified the in-app navigation.

### Cleanup explicitly confirmed

The final run removed its images (including uploads discovered by exact temporary
owner prefixes), removed its non-order drafts, revoked its synthetic reviewer and
deleted the reviewer/other-customer accounts. It compared all original pharmacist
membership rows, including their timestamps, with the pre-run snapshot: unchanged.
Accounts owning audit orders were banned long-term and had passwords rotated in
memory; the bans were read back and verified.

Earlier diagnostic runs were cleaned up the same way. A separate **read-only
aggregate database audit** after the final run confirmed the overall retained state:

| Audit check | Result |
| --- | --- |
| Retained synthetic customer accounts | 4 |
| Retained customer accounts verified disabled | 4 |
| Labelled simulated DO NOT FULFIL orders | 6 |
| Orders lacking test/simulated flags, labels, or zero-points safeguards | 0 |
| Temporary synthetic reviewer memberships | 0 |
| Non-order synthetic prescription drafts | 0 |
| Remaining prescription storage objects for synthetic owners | 0 |
| Synthetic accounts without retained audit orders | 0 |

The six orders include diagnostic-run orders; the successful final run created two.
**Never fulfil these orders.** Ordered prescription records and decision history
remain linked for audit; their test image bytes were removed. No credentials,
sessions or record identifiers are included in this report.

No owner-designated pharmacist membership, SMS configuration, shared customer
setting, real catalogue price/stock, migration, Edge Function deployment or
payment-provider setting was changed.

## Historical handoff status — 2026-10-07

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

On an Android/iOS test device, verify real camera/gallery permission denial and
grant, picker cancellation, capture/selection and private upload. The passing web
run and offline picker tests do not establish native device behavior.

Future live harness runs still require the explicit
`--approved-temporary-no-sms` opt-in and owner approval. Each complete run retains
two labelled simulated orders with their synthetic owner disabled for audit;
do not repeatedly run it as routine CI. Preserve the designated pharmacist,
remove all test images/reviewer access and verify cleanup each time.

The alternative demo-only `scripts/tests/prescription-storage.mjs` was read but
not run: no approved matching demo code was available, and the synthetic-account
approach supplied the real storage evidence instead. Do not guess or retry the
previously failed OTP, request real SMS, or treat fixed demo access as SMS delivery.
