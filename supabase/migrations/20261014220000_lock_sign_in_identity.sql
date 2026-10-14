-- An account is a phone number, shared by the app and the website (roles-and-access,
-- 13 Oct 2026). verify-otp creates the sign-in record with that phone and a placeholder
-- email (<phone>@phone.xanalife.com), and the website signs in with that same email and a
-- password. Nothing in either product changes them afterwards, but the sign-in service
-- lets any session ask to (PUT /auth/v1/user with phone or email). If someone set their
-- copy to another person's number, that person's first verify-otp could fail.
-- So once set, the phone and email on a sign-in record never change. Deleting an account
-- (delete-account) is unaffected.

create or replace function public.lock_sign_in_identity() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.phone is not null and new.phone is distinct from old.phone then
    raise exception 'sign_in_phone_locked' using errcode = '42501';
  end if;
  if old.email is not null and new.email is distinct from old.email then
    raise exception 'sign_in_email_locked' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function public.lock_sign_in_identity() from public, anon, authenticated;

drop trigger if exists lock_sign_in_identity on auth.users;
create trigger lock_sign_in_identity
  before update of phone, email on auth.users
  for each row execute function public.lock_sign_in_identity();

-- Leftover from applying the roles on 13 Oct 2026 (website team); nothing calls it.
drop function if exists public._xana_apply_roles(boolean);
