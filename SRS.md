# XanaPlus — what the app must do

Requirements specification · Version 1.2 · 6 October 2026 · Owner: Product

*Plain-language edition. Every requirement keeps the same reference code as Version 1.0. Version 1.2 records the answers to Decisions 1 to 5 (given 23 September 2026) and marks FR-C.7 as built.*

## Executive summary

XanaPlus gives customers one app for buying groceries and prescription medicines, paying by M-Pesa or another supported method, and following the order until it arrives. Most of the customer-facing app is already built and can be tapped through today; the systems behind it — catalogue, stock, payments, pharmacy — are not yet connected. Approval should stay conditional on management confirming the answers to five business decisions and on proving the app meets the standards set out in section 6.

| What the board should look at | Where we stand | What we are asking for |
| --- | --- | --- |
| Is the scope ready? | 53 things the app must do: all 53 built as screens | Protect what is already working. |
| Is it safe to launch? | 28 measurable quality standards (speed, uptime, security, pharmacy rules, accessibility) | Require hard evidence against each one before launch, not an opinion. |
| What is non-negotiable? | 39 of the 53 are marked Must | Nothing marked Must changes without the named owner agreeing and the impact being written down. |
| What is still undecided? | All 5 business decisions were answered on 23 Sep 2026; management has not yet confirmed them, and three details are still open | Confirm Decisions 1 to 5, and settle the open details in section 8: the cut-off for holding an item, the replacement wording, and the hidden packaging fee. |

**Recommendation:** approve XanaPlus as the agreed launch baseline, on three conditions — confirm the answers to Decisions 1 to 5 and settle their open details; finish every Must item or formally agree an exception; and show evidence that each quality standard in section 6 has been met.

## 1. What this document covers

This document states what the XanaPlus app must do. It is the baseline we plan against, build against and test against.

**Covered:** the customer app on iPhone and Android — browsing, ordering, paying, tracking delivery, and pharmacy services. Web is used only as a development/demo preview, not a supported customer platform.

**Not covered:** the apps used by our shoppers and riders; the warehouse, stock and pharmacy dispensing systems; and M-Pesa itself, which we use as an outside service.

## 2. Who has a stake in it

| Who | What they care about |
| --- | --- |
| Customer | Price, availability, and knowing the delivery will arrive |
| Superintendent Pharmacist | Prescriptions checked properly and pharmacy law followed |
| Branch operations (Syokimau, Ruiru) | Picking orders, handling replacements, handing over collections |
| Finance | Payments captured, refunds, fees and discounts |
| Product and Engineering | Building it, proving it works, keeping it running |

## 3. The problem we are solving

Today customers buy groceries and medicines through separate channels, pay in ways that are hard to reconcile, and can see very little once the order is placed. That makes shopping harder, weakens trust, and complicates our own operations. Prescription medicines add a further problem: they must be checked by a pharmacist, which an ordinary grocery app cannot do.

XanaPlus puts groceries and prescription medicines in one journey, with M-Pesa payment, clear order tracking and pharmacist checks. The customer gets a simpler experience; the business gets tighter control of payments, better visibility of orders, and a defensible position with the pharmacy regulator.

## 4. How to read this document

Every requirement is one short sentence saying what the app does, with a plain test for whether it does it. Each has a permanent reference code so we can talk about it later without ambiguity.

### The codes

| Code | What it means |
| --- | --- |
| **FR-** | A feature — something the app does. FR stands for functional requirement. 53 of them, grouped A to G. |
| **NFR-** | A standard — how well the app must do it (speed, uptime, security, accessibility). NFR stands for non-functional requirement. 28 of them. |
| **US-** | A customer journey, written from the customer's point of view. 5 of them. |
| **D-** | A business decision. 5 of them, in section 8, all answered on 23 Sep 2026. |
| **Must** | Needed for launch. Cannot be dropped without the named owner agreeing. |
| **Should** | Wanted for launch, but launch can go ahead without it. |
| **Could** | Nice to have. Only if there is time. |
| **Built** | The screen exists and works on the device, using sample data built into the app. Not yet connected to a live system. |
| **Designed** | Drawn and specified, not yet built. |
| **Open** | Not started. |
| **⛔ Blocked** | Cannot be built until one of the decisions in section 8 is made. |

Reference codes are permanent. If a requirement is dropped, its code is retired, never given to something else.

### Words you will see

| Word | What it means |
| --- | --- |
| Prescription badge (Rx) | The small symbol on any medicine that needs a prescription. Rx is the pharmacy shorthand for "prescription". |
| Pharmacy and Poisons Board | Kenya's pharmacy regulator. It licenses our pharmacy and sets the rules on dispensing. |
| M-Pesa payment prompt | The message Safaricom pushes to the customer's phone asking them to enter their M-Pesa PIN to approve the payment. Engineers call it an STK push. |
| Dispensing | A pharmacist checking a prescription and handing over the medicine. |
| Screen reader | Software that reads the screen aloud for customers who cannot see it. |
| 9 times out of 10 | The standard must hold for at least 90% of attempts, not on a good day only. |

## 5. What the app must do

### 5.1 Signing in and identity

| Ref | What the app does | How we know it works | Priority | Status |
| --- | --- | --- | --- | --- |
| FR-A.1 | Signs a customer in using a Kenyan mobile number and a 6-digit code sent by text message, usable once | A valid +254 7XXXXXXXX number receives a code, and entering it signs the customer in. An invalid number is refused before any text is sent | Must | Built |
| FR-A.2 | Lets anyone browse and fill a basket without signing in | A signed-out customer can reach checkout with items in the basket | Must | Built |
| FR-A.3 | Asks the customer to sign in before an order is placed | Placing an order while signed out opens sign-in, then returns to checkout | Must | Built |
| FR-A.4 | Shows the customer's name, a partly hidden phone number and their Xana Club tier | The profile shows the number as +254 712 ••• •78 — never in full | Must | Built |
| FR-A.5 | Signs the customer out when they ask | After signing out, no personal detail appears on any screen | Must | Built |
| FR-A.6 | Lets a customer reset their sign-in details and change their privacy settings | Both are reachable from Profile and the change sticks | Should | Built |

### 5.2 Finding products

| Ref | What the app does | How we know it works | Priority | Status |
| --- | --- | --- | --- | --- |
| FR-B.1 | Offers six departments: Groceries, Pharmacy, Deli, Retail, Wholesale, Liquor | Each department opens in one tap from Categories and shows only its own products | Must | Built |
| FR-B.2 | Finds products across all departments when the customer types a word or phrase | Results appear grouped by department within one second (see NFR-P.2) | Must | Built |
| FR-B.3 | Suggests at least three other things to try when nothing matches | A search with no matches shows suggestions, never a blank screen | Must | Built |
| FR-B.4 | Shows whether each product is in stock | An out-of-stock product cannot be added to the basket | Must | Built |
| FR-B.5 | Marks every medicine that needs a prescription | The prescription badge appears in listings, in the basket and at checkout | Must | Built |
| FR-B.6 | Lets the customer narrow and sort results by category, price, stock and express availability | Applying a filter changes the results, and the filter in use is visible | Should | Built |
| FR-B.7 | Identifies a product from a scanned barcode | Scanning a product we stock opens its page | Could | Built |

### 5.3 The basket and out-of-stock items

| Ref | What the app does | How we know it works | Priority | Status |
| --- | --- | --- | --- | --- |
| FR-C.1 | Keeps the basket while the customer moves around the app | Items stay put, and the number on the basket tab matches what is in it | Must | Built |
| FR-C.2 | Lets any basket line have its quantity changed or be removed | Totals update straight away on every change | Must | Built |
| FR-C.3 | Charges the lower bulk price once the customer buys enough of a product | Passing the bulk quantity lowers the unit price and shows the saving | Must | Built |
| FR-C.4 | Asks before checkout what to do if an item is unavailable: replace it, leave it out, or call me first | The choice shows on the basket and travels with the order | Must | Built |
| FR-C.5 | Offers items from past orders when the basket is empty | With nothing in it, the basket shows past purchases and a way back to browsing | Should | Built |
| FR-C.6 | Asks the customer what to do when an item turns out to be unavailable during picking, showing the shopper's note | The customer can choose replace, refund or call, and the choice is recorded on the order | Must | Built |
| FR-C.7 | Follows a set rule when the customer does not answer that question | The unavailable item is held rather than replaced, and the order shows an "Item on hold" card with a way to choose now (Decision 1) | Must | Built |

### 5.4 Checkout and payment

| Ref | What the app does | How we know it works | Priority | Status |
| --- | --- | --- | --- | --- |
| FR-D.1 | Shows the total broken down: items, delivery fee, packaging fee, member savings, amount to pay | The total shown always equals the lines above it added up, on every kind of checkout | Must | Built |
| FR-D.2 | Offers M-Pesa, cash on delivery and card | Choosing a method updates the amount to pay and the confirm button | Must | Built |
| FR-D.3 | Sends the M-Pesa payment prompt to the customer's phone and waits for Safaricom to confirm | While waiting, the screen shows the partly hidden number, the amount, and how to enter the M-Pesa PIN | Must | Built |
| FR-D.4 | Lets the payment prompt be sent again | Sending again issues a fresh request and restarts the waiting time | Must | Built |
| FR-D.5 | Explains what to do when payment does not go through, telling apart a timeout, a cancellation and not enough money | Each cause has its own guidance, and the screen states plainly that no money was taken | Must | Built |
| FR-D.6 | Limits how many times payment can be attempted on one order, then offers another way to pay | On the third attempt, "send again" is withdrawn and another payment method plus a support number are offered | Must | Built |
| FR-D.7 | Holds the chosen delivery slot while payment is retried, and shows how long the hold lasts | A countdown is visible; when it runs out the customer is told the slot has been released | Should | Built |
| FR-D.8 | Stops an order that contains a medicine whose prescription has not been checked | The place-order button is switched off and the item holding it up is named | Must | Built |
| FR-D.9 | Lets the rest of the order go ahead while prescription items wait | Choosing this delivers the other items and keeps the medicines on hold | Should | Built |

### 5.5 Orders, delivery and collection

| Ref | What the app does | How we know it works | Priority | Status |
| --- | --- | --- | --- | --- |
| FR-E.1 | Creates the order once payment is confirmed, recording items, totals, payment method, address, delivery slot and branch | The order appears in history with today's date and its own reference number | Must | Built |
| FR-E.2 | Follows the order through Received, Shopping, Out for delivery, Delivered | The stage it is at now looks clearly different from the stages already passed and still to come | Must | Built |
| FR-E.3 | Lists every order, with filters for active, delivered and cancelled | Each filter shows only its own orders and its own count | Must | Built |
| FR-E.4 | Repeats any past order in a single tap | The basket fills with the same items and quantities | Should | Built |
| FR-E.5 | Shows the points earned and the payment reference on a completed order | Both appear on every paid order | Should | Built |
| FR-E.6 | Accepts a return or refund request on a delivered order | The request records the items, a reason, and where the refund should go | Should | Built |
| FR-E.7 | Saves delivery addresses with a label, the person receiving and a contact number | A saved address can be chosen at checkout and is still there next time | Must | Built |
| FR-E.8 | Refuses an address outside the area we deliver to, and offers to tell the customer when we cover it | An address outside the area cannot be saved for delivery | Must | Built |

### 5.6 Pharmacy and prescriptions

| Ref | What the app does | How we know it works | Priority | Status |
| --- | --- | --- | --- | --- |
| FR-F.1 | Accepts photographs of a prescription for a pharmacist to check | It cannot be sent until at least one photo is attached and the customer confirms the prescription is valid | Must | Built |
| FR-F.2 | Records who the prescription is for, including a dependant such as a child or parent | Choosing a dependant requires a name before it can be sent | Must | Built |
| FR-F.3 | Tells the customer before sending if the photo is too poor to read | An unusable photo is flagged so it can be retaken | Should | Built |
| FR-F.4 | Follows the prescription through Received, With pharmacist, Dispensed, Ready | The stage it is at now and the expected ready time are both shown | Must | Built |
| FR-F.5 | Keeps a list of repeat medicines with the prescriber, the date last dispensed and the refills left | All four appear for every repeat medicine | Must | Built |
| FR-F.6 | Flags an expired prescription and blocks reordering against it until it is renewed | An expired repeat cannot be selected; the only action offered is renewal | Must | Built |
| FR-F.7 | Lets a repeat be ordered for delivery or branch collection, and set to recur | The confirmation says no money is taken until the pharmacist approves | Must | Built |
| FR-F.8 | Offers a private conversation with a named, registered pharmacist | The pharmacist's name and registration number are shown before the conversation starts | Must | Built |
| FR-F.9 | Lets the customer share their medicines list with the pharmacist, switched off unless they turn it on | Nothing is shared until the customer turns it on | Must | Built |
| FR-F.10 | Offers clinical services the customer can book | A booking records the service, the branch and the time | Could | Built |

### 5.7 Rewards and spending

| Ref | What the app does | How we know it works | Priority | Status |
| --- | --- | --- | --- | --- |
| FR-G.1 | Gives Xana Club points on every completed order, at a published rate | The points shown on the order equal the published rate applied to the amount paid | Must | Built |
| FR-G.2 | Shows member savings as their own line at checkout | The discount is a separate line, never folded into another figure | Must | Built |
| FR-G.3 | Reports savings and spending over a chosen period, split by department | The figures come from order history and add up to the orders they summarise | Should | Built |
| FR-G.4 | Reports pharmacy spending as a single total, never itemised by medicine | No medicine name appears in any spending or insights screen | Must | Built |
| FR-G.5 | Lets points be put towards an order | Using points lowers both the amount to pay and the points balance | Could | Built |
| FR-G.6 | Sends order updates and offers, with the customer choosing which kinds they get | Switching off a kind stops those messages | Should | Built |

## 6. How well the app must work

These are the standards the app is measured against. Each one has a number attached, so it can be proved rather than argued about.

### 6.1 Speed

| Ref | The standard | How it is measured | Priority |
| --- | --- | --- | --- |
| NFR-P.1 | The home screen is ready to use within 3 seconds of opening the app, on an ordinary Android phone on a 4G connection | Opening from fully closed, 9 times out of 10 | Must |
| NFR-P.2 | Search results appear within 1 second of the customer searching | 9 times out of 10 | Must |
| NFR-P.3 | The basket total updates within a fifth of a second of any change | Measured on the phone itself | Must |
| NFR-P.4 | The app takes under 60 MB of space on an Android phone | The size shown on the Play Store listing | Should |
| NFR-P.5 | A normal browse-and-order session uses no more than 5 MB of mobile data | Measured over a session of 20 screens | Should |

### 6.2 Staying available, and behaving when things go wrong

| Ref | The standard | How it is measured | Priority |
| --- | --- | --- | --- |
| NFR-A.1 | The app works 99.5% of the time between 7am and 10pm Nairobi time | Measured monthly, not counting maintenance announced in advance | Must |
| NFR-A.2 | The basket survives a loss of signal and comes back when the connection returns | The basket is unchanged after 60 seconds without a connection | Must |
| NFR-A.3 | The app says clearly when something failed because the phone is offline, and never suggests a payment succeeded when it has not | No success message is ever shown without confirmation from the payment provider | Must |
| NFR-A.4 | Any payment that has not been confirmed is treated as unpaid | No order is created until the payment provider confirms it | Must |

### 6.3 Security and privacy

| Ref | The standard | How it is measured | Priority |
| --- | --- | --- | --- |
| NFR-S.1 | Everything the app sends is encrypted, to the same standard banks use (TLS 1.2 or later) | Nothing readable appears when the connection is inspected | Must |
| NFR-S.2 | The customer's M-Pesa PIN is never stored or sent by us | The PIN is only ever typed into Safaricom's own prompt on the handset | Must |
| NFR-S.3 | Phone numbers are partly hidden everywhere except the field where the customer types one | Checked on every screen | Must |
| NFR-S.4 | Prescription photos and medicine names are visible only to the account holder and the dispensing pharmacist | No medicine name appears in any shared or summary screen | Must |
| NFR-S.5 | A customer who has not used the app for 30 days is signed out | They must sign in again after that period | Should |
| NFR-S.6 | We record who looked at prescription information and when | The record is kept for 7 years, as pharmacy record-keeping rules require | Must |

### 6.4 Pharmacy rules

| Ref | The standard | How it is measured | Priority |
| --- | --- | --- | --- |
| NFR-C.1 | No prescription medicine is ever dispensed without a pharmacist checking it | No prescription item leaves the branch without a recorded approval | Must |
| NFR-C.2 | Our Pharmacy and Poisons Board licence and the operating company are shown on every pharmacy screen | Present on all pharmacy screens | Must |
| NFR-C.3 | Every dispensing decision is attached to a named, registered pharmacist | The name and registration number are recorded against each order | Must |
| NFR-C.4 | The app states that a pharmacist consultation is not a substitute for emergency care, and gives the emergency number | Shown before and during every consultation | Must |

### 6.5 Ease of use, including for customers with disabilities

| Ref | The standard | How it is measured | Priority |
| --- | --- | --- | --- |
| NFR-U.1 | A returning customer can repeat a grocery order in 6 taps or fewer from opening the app | Counted on the buy-again route | Should |
| NFR-U.2 | All text is easy to read against its background | Meets the international accessibility standard (WCAG 2.1 AA): normal text 4.5 times the brightness of its background, large text 3 times | Must |
| NFR-U.3 | Every button is large enough to tap comfortably | At least 44 by 44 points, roughly a fingertip, checked across all screens | Must |
| NFR-U.4 | Every button and control is named for the screen-reading software blind customers use | No unnamed control found in an accessibility check | Must |
| NFR-U.5 | The app stays usable when the customer sets their phone to the largest text size | No cut-off or overlapping text at double-size text | Should |

### 6.6 Devices, money and dates

| Ref | The standard | How it is measured | Priority |
| --- | --- | --- | --- |
| NFR-L.1 | One build runs on iPhone (iOS 15 and later) and Android (8 and later). Web is a development/demo preview only, not a supported customer platform | Tested on the oldest version we support of each | Must |
| NFR-L.2 | All money is shown in Kenyan shillings, written KES 1,670 | No other currency or format appears anywhere | Must |
| NFR-L.3 | Kenyan mobile numbers are accepted and shown as +254 7XXXXXXXX | Other formats are refused as they are typed | Must |
| NFR-L.4 | Dates are shown as 20 Sep 2026 and times on a 12-hour clock, Nairobi time | The same on every screen | Should |

## 7. The five customer journeys

These are the journeys the requirements exist to support. Each one can be built, valued and tested on its own.

| Ref | The journey | Delivered by |
| --- | --- | --- |
| US-1 | As a Nairobi shopper, I want to order groceries for a delivery window I choose, so I can plan my day around it | FR-B.1, FR-C.1 to C.3, FR-D.1 to D.3, FR-E.1 to E.2 |
| US-2 | As a customer whose payment failed, I want to know why and try again or pay another way, so I do not lose the basket I built | FR-D.5 to D.7 |
| US-3 | As a customer whose item is out of stock, I want to decide what happens, so I am not charged for something I did not want | FR-C.4, FR-C.6 to C.7 |
| US-4 | As a patient on long-term medication, I want to reorder my repeats and collect them from my branch, so I do not run out | FR-F.4 to F.7 |
| US-5 | As a customer buying prescription medicine, I want to send my prescription and know it was checked, so my order is lawful and safe | FR-B.5, FR-D.8 to D.9, FR-F.1 to F.4, NFR-C.1 to C.3 |

## 8. Decisions we need from the business

The designs said different things on these five points. All five were answered on 23 Sep 2026 and the app follows the answers. Management has not yet confirmed them, and the details marked "Still open" need settling.

| Ref | The decision | Affects | Owner | Answer (23 Sep 2026) | Still open |
| --- | --- | --- | --- | --- | --- |
| D-1 | When we cannot reach a customer about an out-of-stock item, do we drop the item and refund it, or send the nearest equivalent? | FR-C.7 | Operations | Neither: hold the item until the customer is reached | How long to hold. Suggested: 30 minutes of attempts, then the next slot, then remove the item and refund it by credit note |
| D-2 | Is an M-Pesa refund immediate or within 24 hours? And is refunding a price difference handled differently from refunding a whole item? | FR-E.6, NFR-A.4 | Finance | Not immediate: every refund goes through an internal credit note first | How long a refund takes |
| D-3 | Is a replacement of equal or higher value free to the customer, or do we send a cheaper one and refund the difference? What do we do when only a dearer equivalent exists? | FR-C.6 | Commercial | Mark the item out of stock and suggest an alternative; the customer chooses (for now) | The wording "equal or greater value at no extra cost" is not confirmed |
| D-4 | Which lines does the order summary officially show — is the packaging fee shown alongside member savings, or instead of it? | FR-D.1 | Finance | The packaging fee is never shown | The KES 20 fee is still charged, so the lines shown do not add up to the total (FR-D.1) |
| D-5 | What is the published rate at which customers earn points? | FR-G.1 | Commercial | 1 point per KES 120 spent | Points are spent at 10 points = KES 1, which returns under 0.1% |

Decisions 1, 2 and 3 carry direct financial and trust consequences. Getting one of them wrong means charging a customer for something they did not want, or promising a refund we do not honour.

## 9. Deliberately left out of the first launch

Barcode scanning, wishlists, in-app support chat, spending points, saved card management, changing a delivery slot after ordering, and languages other than English. These are recorded here so nobody mistakes them for oversights.

## 10. How this document changes

- Raise every proposed change against the reference code it affects.
- Retire a requirement that is superseded rather than editing it in place, so the history stays clear.
- Give each new requirement the next unused code in its group. Never reuse a code.
- Get the named owner's agreement before changing anything marked Must, or anything in section 8.
- This document is what we test against at launch. If the app differs from it, this document wins until it is formally changed.