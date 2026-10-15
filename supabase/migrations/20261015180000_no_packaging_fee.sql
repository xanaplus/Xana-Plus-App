-- No packaging fee on app orders (owner, 15 Oct 2026). Web orders already carry none.
-- place-order now sends platformFee 0 too; this default covers any caller that omits it.
update public.settings set value = '0' where key = 'platform_fee_app';
