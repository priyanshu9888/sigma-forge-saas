-- ============================================================
-- FigmaForge SaaS — Add profile fields for name/company/country
-- Run in Supabase → SQL Editor after 001_initial.sql
-- ============================================================

alter table public.profiles
  add column if not exists full_name text,
  add column if not exists company text,
  add column if not exists country text,
  add column if not exists currency text;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, email, full_name, company, country, currency)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'company',
    new.raw_user_meta_data->>'country',
    new.raw_user_meta_data->>'currency'
  );
  return new;
end;
$$;
