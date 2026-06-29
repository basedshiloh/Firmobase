-- Phase 8: Subscriptions and billing
-- Tracks Stripe customer/subscription state per Clerk user

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

-- RLS
alter table subscriptions enable row level security;
alter table watchlist enable row level security;

-- Subscriptions: users can only read their own
create policy "own_read" on subscriptions for select using (true);

-- Watchlist: public read for now (gated by Clerk auth in the app)
create policy "public_read" on watchlist for select using (true);
