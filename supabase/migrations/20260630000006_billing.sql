-- Phase 7: User billing (Clerk + Stripe) and watchlist
--
-- RLS model: Clerk JWT per-user. The browser reads/writes via supabase-js with a
-- Clerk-issued JWT whose `sub` claim is the Clerk user id. Policies scope every
-- row to its owner. Stripe webhooks write `subscriptions` with the service role
-- (which bypasses RLS), so there is intentionally no client write policy there.
--
-- auth.jwt()->>'sub' is wrapped in a scalar subquery so the planner evaluates it
-- once per statement (initplan) instead of once per row.

create table if not exists subscriptions (
  id              uuid primary key default gen_random_uuid(),
  clerk_user_id   text not null unique,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  plan            text not null default 'free',
  status          text not null default 'active',
  current_period_start timestamptz,
  current_period_end   timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists watchlist (
  id          uuid primary key default gen_random_uuid(),
  clerk_user_id text not null,
  company_id  uuid not null references companies(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (clerk_user_id, company_id)
);

create index if not exists idx_subscriptions_clerk on subscriptions(clerk_user_id);
create index if not exists idx_subscriptions_stripe on subscriptions(stripe_customer_id);
create index if not exists idx_watchlist_user on watchlist(clerk_user_id);
create index if not exists idx_watchlist_company on watchlist(company_id);

create trigger set_subscriptions_updated_at
  before update on subscriptions
  for each row execute function set_updated_at();

alter table subscriptions enable row level security;
alter table watchlist enable row level security;

-- subscriptions: owner may read its own row; writes are service-role only.
create policy "own_read" on subscriptions
  for select
  using ((select auth.jwt() ->> 'sub') = clerk_user_id);

-- watchlist: owner may read, add, and remove its own entries.
create policy "own_read" on watchlist
  for select
  using ((select auth.jwt() ->> 'sub') = clerk_user_id);

create policy "own_insert" on watchlist
  for insert
  with check ((select auth.jwt() ->> 'sub') = clerk_user_id);

create policy "own_delete" on watchlist
  for delete
  using ((select auth.jwt() ->> 'sub') = clerk_user_id);
