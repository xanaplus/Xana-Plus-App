-- A stored POS photo address that no longer loads (product-image-api.md §3: on a
-- 404, ask the image API again for that item). The app reports it here; this
-- clears photo_checked_at so product-images-sync, which takes never-checked items
-- first every 2 minutes, asks the POS again for a fresh address.
--
-- Open to signed-out shoppers too (photos show before sign-in). It only ever
-- moves a re-check forward, at most once an hour per item, so it can't be used
-- to flood the POS beyond the sync's own pace.
create or replace function public.report_broken_photo(p_item_no text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.products
     set photo_checked_at = null
   where item_no = p_item_no
     and photo_url is not null
     and photo_checked_at < now() - interval '1 hour';
$$;

revoke all on function public.report_broken_photo(text) from public;
grant execute on function public.report_broken_photo(text) to anon, authenticated;
