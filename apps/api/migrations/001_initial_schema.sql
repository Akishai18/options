-- StratLab — initial schema (V1 persistent storage).
--
-- Apply once per Supabase project:
--   1. Open Supabase → SQL Editor
--   2. Paste the contents of this file
--   3. Run
--
-- Idempotent: safe to re-run. Drops policies before recreating them so a
-- second pass doesn't error.

-- ---------------------------------------------------------------------------
-- extensions
-- ---------------------------------------------------------------------------

create extension if not exists "uuid-ossp";

-- ---------------------------------------------------------------------------
-- tables
-- ---------------------------------------------------------------------------

create table if not exists public.strategies (
  id           uuid        primary key default uuid_generate_v4(),
  user_id      uuid        not null references auth.users(id) on delete cascade,
  name         text        not null,
  created_at   timestamptz not null default now()
);

create index if not exists strategies_user_idx
  on public.strategies(user_id, created_at desc);


create table if not exists public.strategy_versions (
  id           uuid        primary key default uuid_generate_v4(),
  strategy_id  uuid        not null references public.strategies(id) on delete cascade,
  schema_obj   jsonb       not null,
  created_at   timestamptz not null default now()
);

create index if not exists strategy_versions_strategy_idx
  on public.strategy_versions(strategy_id, created_at);


create table if not exists public.backtests (
  id           uuid        primary key default uuid_generate_v4(),
  user_id      uuid        not null references auth.users(id) on delete cascade,
  strategy_id  uuid        not null references public.strategies(id) on delete cascade,
  version_id   uuid        not null references public.strategy_versions(id) on delete cascade,
  status       text        not null check (status in ('queued','running','completed','failed')),
  result       jsonb,
  error        text,
  created_at   timestamptz not null default now()
);

create index if not exists backtests_user_idx
  on public.backtests(user_id, created_at desc);
create index if not exists backtests_version_idx
  on public.backtests(version_id);


create table if not exists public.chat_messages (
  id           uuid        primary key default uuid_generate_v4(),
  user_id      uuid        not null references auth.users(id) on delete cascade,
  strategy_id  uuid        not null references public.strategies(id) on delete cascade,
  role         text        not null check (role in ('user','assistant')),
  content      text        not null,
  created_at   timestamptz not null default now()
);

create index if not exists chat_messages_strategy_idx
  on public.chat_messages(strategy_id, created_at);

-- ---------------------------------------------------------------------------
-- RLS — defense in depth.
-- The service-role key bypasses these, but every server query also filters
-- by user_id explicitly. Anon key would respect RLS, blocking cross-user reads.
-- ---------------------------------------------------------------------------

alter table public.strategies          enable row level security;
alter table public.strategy_versions   enable row level security;
alter table public.backtests           enable row level security;
alter table public.chat_messages       enable row level security;

drop policy if exists "users see own strategies"        on public.strategies;
drop policy if exists "users see own versions"          on public.strategy_versions;
drop policy if exists "users see own backtests"         on public.backtests;
drop policy if exists "users see own chat messages"     on public.chat_messages;

create policy "users see own strategies"
  on public.strategies
  for all
  using (auth.uid() = user_id);

create policy "users see own versions"
  on public.strategy_versions
  for all
  using (
    exists (
      select 1 from public.strategies s
      where s.id = strategy_versions.strategy_id and s.user_id = auth.uid()
    )
  );

create policy "users see own backtests"
  on public.backtests
  for all
  using (auth.uid() = user_id);

create policy "users see own chat messages"
  on public.chat_messages
  for all
  using (auth.uid() = user_id);
