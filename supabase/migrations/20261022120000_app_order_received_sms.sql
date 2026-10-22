-- App orders get an "order received" SMS (owner, 22 Oct 2026).
-- place-order saves app orders itself (not through create_order()), so nothing queued a
-- text for them. It now queues one outbox row of a new kind, sms_order_received; the
-- website team's outbox-send owns the wording and sends it like the other order SMS.
--
-- The website team has added kinds to outbox_kind_check since 14 Oct (sms_receipt,
-- email_receipt, maybe more), so the live list is read and extended here, not retyped.
do $$
declare
  v_def text;
  v_new text;
begin
  select pg_get_constraintdef(oid) into v_def
    from pg_constraint
   where conrelid = 'public.outbox'::regclass and conname = 'outbox_kind_check';
  if v_def is null then
    raise exception 'outbox_kind_check not found';
  end if;
  if v_def like '%''sms_order_received''%' then
    return;
  end if;
  v_new := regexp_replace(v_def, '::text\]', '::text, ''sms_order_received''::text]');
  if v_new = v_def then
    raise exception 'outbox_kind_check has an unexpected shape: %', v_def;
  end if;
  alter table public.outbox drop constraint outbox_kind_check;
  execute 'alter table public.outbox add constraint outbox_kind_check ' || v_new;
end;
$$;
