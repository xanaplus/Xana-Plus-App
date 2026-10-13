-- Preserve legacy orders as unknown rather than inventing historical discounts
-- from today's changing catalogue. New general-cart checkouts write exact savings.
alter table public.orders add column if not exists wholesale_savings numeric
  check (wholesale_savings is null or wholesale_savings >= 0);
