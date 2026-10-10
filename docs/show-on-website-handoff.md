# Hide non-customer items from the shared catalogue

The Xana website handoff lists 60 non-customer items: packaging, cups and lids,
gloves, piping bags, cake bases, bulk syrups, staff meals, gift vouchers and used
oil. The exact supplied item numbers are preserved in `docs/hide-from-website.csv`.

## Approved behavior

The owner approved filtering the shared `catalogue` view after being informed that
this hides the listed items from both the website and Xana Plus app.
The products remain in the database and Business Central/POS; no stock, price,
wholesale rules, images or active status is deleted or changed.

`public.products.show_on_website` is a local, non-null boolean, defaulting to true.
It is false only for the supplied exclusions. New products remain visible by
default, subject to the existing active/positive-price catalogue rules.

The read-only public catalogue keeps its existing column order, wholesale tiers,
stock calculations and Rx/age restrictions, with the extra visibility condition.
It does not expose the visibility flag, costs or margins. Public clients retain
SELECT access but cannot insert, update or delete through this view.

The existing BC item sync sends an explicit subset of product fields, excluding
this local flag. Its upserts preserve visibility on existing products.
The separate wholesale sync likewise updates only its tier/sync fields.
Do not add visibility to either sync's write payload.

## Deployment and maintenance

The scoped migration is
`supabase/migrations/20261010010000_customer_catalogue_visibility.sql`.
Apply it explicitly against the existing shared Supabase backend; never add
automatic migration execution to startup or post-merge setup.

No website or app frontend changes are needed. According to the website handoff,
its catalogue cache refreshes within about a minute. Existing app screens/device
caches may need to refresh before the exclusions disappear.

When replacing the catalogue view in future migrations, preserve this visibility
condition and the public read-only grants. A historical migration's old view
definition must not be reapplied over the current one.
