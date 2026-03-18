-- ============================================================
-- FigmaForge SaaS — Supabase Database Schema
-- Run these in Supabase → SQL Editor (in order)
-- ============================================================

-- ── 1. Profiles table ──────────────────────────────────────
-- Extends Supabase auth.users with plan + usage tracking.

create table if not exists public.profiles (
  id              uuid references auth.users(id) on delete cascade primary key,
  email           text,
  plan            text not null default 'free' check (plan in ('free','pro','team')),
  monthly_usage   integer not null default 0,
  usage_reset_at  timestamptz not null default (date_trunc('month', now()) + interval '1 month'),
  stripe_customer_id text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ── 2. Generations table ───────────────────────────────────
-- Full audit log of every project generated.

create table if not exists public.generations (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references public.profiles(id) on delete cascade,
  figma_url     text not null,
  framework     text not null,
  version       text not null,
  styling       text,
  tailwind_ver  text,
  package_mgr   text,
  files_count   integer,
  project_id    text,
  created_at    timestamptz not null default now()
);

create index if not exists generations_user_id_idx on public.generations(user_id);
create index if not exists generations_created_at_idx on public.generations(created_at);

-- ── 3. increment_usage RPC ─────────────────────────────────
-- Called after each successful generation. Resets if month has rolled over.

create or replace function public.increment_usage(user_id uuid)
returns void language plpgsql security definer as $$
begin
  -- Reset counter if we're in a new month
  update public.profiles
  set
    monthly_usage  = 0,
    usage_reset_at = date_trunc('month', now()) + interval '1 month'
  where
    id = user_id
    and usage_reset_at <= now();

  -- Increment counter
  update public.profiles
  set
    monthly_usage = monthly_usage + 1,
    updated_at    = now()
  where id = user_id;
end;
$$;

-- ── 4. Row Level Security ──────────────────────────────────
-- Users can only read/write their own data.

alter table public.profiles enable row level security;
alter table public.generations enable row level security;

-- Profiles: user can read/update own row only
create policy "profiles: own row" on public.profiles
  for all using (auth.uid() = id);

-- Generations: user can read own rows only
create policy "generations: own rows" on public.generations
  for select using (auth.uid() = user_id);

-- Service role can write generations (used by backend)
create policy "generations: service insert" on public.generations
  for insert with check (true);

-- ── 5. Realtime (optional) ─────────────────────────────────
-- Enable realtime on profiles so dashboard updates live.
alter publication supabase_realtime add table public.profiles;
