Hi Roy,

Online payment through DPO is **live on www.xanalife.com since 19 Nov 2026, 10:00 EAT**. The website now takes real M-Pesa and card payments on Xana's own DPO account. This changes what happens when the app pays online, so please read section 3 before you test anything from the app.

**1. What is live (19 Nov)**
- **DPO's live account:** 43844 REFRONTIER XANA PHARMACY LIMITED, service type **114430**. The `dpo` function's secrets (`DPO_COMPANY_TOKEN`, `DPO_SERVICE_TYPE`) now hold the live values. DPO's shared test account (service 6447) is no longer used.
- **The live callback works.** DPO enabled it on the live account. `https://yinlbtldfojobuwddpsj.supabase.co/functions/v1/dpo/notify` received DPO's notice for both first payments, from 34.250.168.72, 45 to 90 seconds after payment. Each one matched its order in `payment_events` (kind `notification`).
  - The callback is set once per account, so app payments on 43844 use the same one.
  - DPO sends no retries, so the 2-minute sweep (`dpo-sweep`) stays on as the backstop.
  - **Correction to my 14 Nov note:** the live callback was not registered on 13 Nov. It was only switched on this week.
- **Admin Settings switched on:** website checkout, Pay online (DPO), KRA eTIMS **live**, Business Central **live**. Delivery on the website stays off for now.
- **First real orders, both KSh 5, pickup at Syokimau:**
  - WB-887779, M-Pesa: paid, DPO ref UKJAK2GAEC.
  - WB-494066, card: paid.
  - Each got a real KRA receipt (CU 0066652 and 0066656), the receipt SMS, the branch's new-order SMS, the receipt email, and a row on the admin Payments screen with DPO's reference.

**2. Business Central: an issue that also affects the POS**
- Since **18 Nov 09:27 EAT**, BC Production refuses sales lines with "Item … tracked quantity 0 does not match line quantity …".
- This is not the website: the POS has logged about 1,340 of these since then (`dynamics_failures`, every branch, many items), and none before 18 Nov. Something changed in BC that morning, most likely item (lot) tracking.
- Finance and the BC partner are being asked to fix it. App orders posted to BC will hit the same error until they do. KRA, SMS and payments are not affected.

**3. What this means for the app now**
- **Any app order paid with `dpo` is now real money** on the live account. There is no DPO test account behind the function any more. Test from the app only with small real amounts (we use the KSh 5 Kifaru Ndogo Matchbox, FS0103, at Syokimau), and cancel or collect the order afterwards.
- **The service type is not settled for the app.** On 14 Nov the owner chose 114430 for the website and 118044 for the app. But DPO's live credentials (18 Nov) list only **114430 ("Retail")** on account 43844. We have asked DPO whether the app shares 43844 with its own service type, or gets a separate account. Until DPO answers:
  - App payments would be booked under 114430, the website's service type. That works for payment, but finance can't tell app and website apart in DPO's reports (our own Payments screen and CSV still show the channel).
  - The per-channel service type (open item 10: the `dpo` function picks the service type from `orders.channel` through a second secret, e.g. `DPO_SERVICE_TYPE_APP`) is not built yet. We build it once DPO confirms the app's service type or account.
  - If DPO gives the app its own account, it needs its own company token and its own callback registered by DPO. We will tell you which it is.
  - **Nothing in the app changes either way:** the app never sends a service type or token.
- **The payment fee on app orders** (open item 11, owner 14 Nov: the same fee as the website) is not built yet. `create_order()` still refuses `paymentFeeMethod` on app orders. Until it is, app orders pay no fee, and DPO's page shows every method instead of being locked to the customer's choice. We will tell you when it is live.

**4. What we need from you to finish the app**
These are the open items in `docs/upstream/dpo-integration.md` section 9:

| # | Item | Status |
| --- | --- | --- |
| 2 | `place-order` wraps `create_order()` and passes `paymentMethod: 'dpo'` when the customer picks Pay online | Yours, open |
| 3 | `isTest` set only for staff, pharmacist or admin accounts, from `profiles.role` on the server. Note: with checkout and online payment on, the website's staff orders are now real orders, and DPO is live for any `dpo` order whatever `isTest` says | Yours, open |
| 4 | **The app's return link** (for example `xanaplus://order/` or an https App Link), so we can set `APP_RETURN_PREFIXES`. Until then card payments return to the website's order page | **We need it from you** |
| 5 | The app shows each payment state with the website's wording (`assets/order-rules.js`) | Yours, open |
| 12 | M-Pesa and Airtel Money prompts straight to the phone (`POST /dpo/mobile`, my second 14 Nov note). Live in the function, never tried from a real app order | Yours: the first app order with `paymentMethod: 'dpo'` is the first real test. Tell us before you try it and we'll watch the records |

For each test, tell us the order number. We check `payments`, `payment_events` (look for a `notification` row), KRA and the SMS.

The details are in the website repo:
- `docs/upstream/dpo-integration.md` (sections 7a, 8, 8a and 9);
- `docs/go-live-run-sheet.md` (the switches and the first real orders);
- `docs/launch-status.md` (19 Nov).

Thanks!
