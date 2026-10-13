---
name: Prescription-first ordering
description: User-selected Pharmacy ordering workflow and scope.
---

For prescription ordering, customers upload the prescription first. A pharmacist identifies the medicines and confirms prices before the customer orders.

**Why:** the user selected “Upload prescription first” rather than choosing medicines first or supporting both entry paths.

**How to apply:** implement the Pharmacy workflow around upload, pharmacist review and quote, then customer confirmation and checkout. Do not treat a customer-entered reference as pharmacist approval.

Only items in BC's Controlled inventory posting group require a prescription before purchase. Generic PHARMACY, POM or CHRONIC item-category codes do not require one on their own.

**Why:** the user identified Controlled in BC as the classification for items that need prescriptions, then explicitly confirmed “Yes, only Controlled.”

**How to apply:** derive the customer prescription flag from BC's Controlled inventory posting group only, preserving server-side pharmacist approval for those items. Do not infer prescription restrictions from other category names.
