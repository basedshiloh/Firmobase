-- Phase 6: Government grants schema
-- Stores EU/national grant programs and links them to companies

create table if not exists grants (
  id            uuid primary key default gen_random_uuid(),
  program       text not null,           -- e.g. 'FENG', 'PARP', 'NCBR', 'POIR'
  program_year  smallint,                -- call/edition year
  title         text not null,           -- project title
  description   text,
  beneficiary_name text,                 -- raw beneficiary name from source
  amount_pln    numeric(18,2),           -- total grant amount in PLN
  amount_eu     numeric(18,2),           -- EU co-financing portion
  start_date    date,
  end_date      date,
  status        text,                    -- e.g. 'completed', 'in_progress', 'cancelled'
  voivodeship   text,
  source_url    text,                    -- link to original grant listing
  source_id     text unique,             -- dedupe key from source system
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists company_grants (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies(id) on delete cascade,
  grant_id      uuid not null references grants(id) on delete cascade,
  match_method  text not null default 'nip',  -- 'nip', 'name', 'manual'
  match_score   real,                          -- confidence 0.0–1.0
  created_at    timestamptz not null default now(),
  unique (company_id, grant_id)
);

-- Indexes
create index if not exists idx_grants_program on grants(program);
create index if not exists idx_grants_beneficiary_trgm on grants using gin (beneficiary_name gin_trgm_ops);
create index if not exists idx_grants_source_id on grants(source_id);
create index if not exists idx_company_grants_company on company_grants(company_id);
create index if not exists idx_company_grants_grant on company_grants(grant_id);

-- updated_at trigger
create trigger set_grants_updated_at
  before update on grants
  for each row execute function set_updated_at();

-- RLS
alter table grants enable row level security;
alter table company_grants enable row level security;

create policy "public_read" on grants for select using (true);
create policy "public_read" on company_grants for select using (true);
