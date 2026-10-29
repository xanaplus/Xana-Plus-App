-- A customer who already has an open prescription request can ask for another
-- medicine on it, instead of uploading the same prescription again. The medicine
-- is added to the request's notes for the pharmacist ("Also for: ..."). A request
-- that was already quoted goes back to the pharmacist's queue, and its old quote
-- is cleared, so the customer never orders from a quote the pharmacist has not
-- seen the new medicine against.

create or replace function public.add_prescription_item(p_id uuid, p_item text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare v prescriptions; v_item text := trim(coalesce(p_item, '')); v_notes text;
begin
  if auth.uid() is null then raise exception 'signed_out'; end if;
  if v_item = '' or length(v_item) > 200 then raise exception 'invalid_prescription'; end if;
  select * into v from prescriptions where id = p_id and user_id = auth.uid() for update;
  if not found or v.status not in ('submitted', 'clarification', 'held', 'quoted') then raise exception 'not_open'; end if;
  -- Already asked for: nothing to do.
  if position(lower(v_item) in lower(v.notes)) > 0 then return; end if;
  v_notes := case when v.notes = '' then 'For: ' || v_item else v.notes || E'\nAlso for: ' || v_item end;
  if length(v_notes) > 1000 then raise exception 'notes_full'; end if;
  if v.status = 'quoted' then
    update prescriptions set notes = v_notes, status = 'submitted', quote_lines = '[]'::jsonb,
      quoted_at = null, valid_until = null, updated_at = now() where id = p_id;
  else
    update prescriptions set notes = v_notes, updated_at = now() where id = p_id;
  end if;
end; $$;

revoke all on function public.add_prescription_item(uuid, text) from public, anon;
grant execute on function public.add_prescription_item(uuid, text) to authenticated;
