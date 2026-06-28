-- ─────────────────────────────────────────────────────────────────────────
-- Firmobase — Phase 1 core schema (company registry spine)
-- Source of truth for DB structure. ORM models in services/pipeline mirror this.
-- Apply with: supabase db push   (or via the Supabase MCP once reconnected)
-- ─────────────────────────────────────────────────────────────────────────

create extension if not exists pg_trgm;      -- fuzzy / typo-tolerant search
create extension if not exists pgcrypto;     -- gen_random_uuid()

-- ── enums ────────────────────────────────────────────────────────────────
do $$ begin
  create type person_type as enum ('natural', 'legal');
exception when duplicate_object then null; end $$;

do $$ begin
  create type role_category as enum (
    'management_board',   -- zarząd
    'supervisory_board',  -- rada nadzorcza
    'proxy',              -- prokura
    'shareholder',        -- wspólnik / akcjonariusz
    'partner'             -- partner (spółki osobowe)
  );
exception when duplicate_object then null; end $$;

-- ── companies ────────────────────────────────────────────────────────────
create table if not exists companies (
  id                      uuid primary key default gen_random_uuid(),
  krs                     text unique,                       -- 10-digit, leading zeros preserved
  nip                     text,
  regon                   text,
  name                    text not null,
  legal_form              text,
  legal_form_code         text,
  status                  text,                              -- active / in_liquidation / deleted ...
  ekrs_section            text,                              -- registry (przedsiębiorców / stowarzyszeń)
  registry_court          text,
  registration_date       date,
  share_capital           numeric(18,2),
  share_capital_currency  text default 'PLN',
  website                 text,
  email                   text,
  phone                   text,
  source                  text,                              -- ekrs_api / ekrs_scraper
  last_ingested_at        timestamptz,
  raw                     jsonb,                             -- full source payload for reprocessing
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index if not exists idx_companies_nip   on companies (nip);
create index if not exists idx_companies_regon on companies (regon);
create index if not exists idx_companies_status on companies (status);
create index if not exists idx_companies_name_trgm on companies using gin (name gin_trgm_ops);

-- ── addresses (with validity for history) ────────────────────────────────
create table if not exists company_addresses (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies (id) on delete cascade,
  address_type  text default 'registered',                  -- registered / correspondence
  street        text,
  building_no   text,
  apartment_no  text,
  postal_code   text,
  city          text,
  commune       text,                                       -- gmina
  district      text,                                       -- powiat
  voivodeship   text,                                       -- województwo
  country       text default 'PL',
  valid_from    date,
  valid_to      date,
  raw           jsonb,
  created_at    timestamptz not null default now()
);

create index if not exists idx_addresses_company on company_addresses (company_id);
create index if not exists idx_addresses_city     on company_addresses (city);
create index if not exists idx_addresses_voiv     on company_addresses (voivodeship);

-- ── persons (natural OR legal entities that hold roles) ───────────────────
create table if not exists persons (
  id                 uuid primary key default gen_random_uuid(),
  person_type        person_type not null,
  full_name          text not null,
  first_name         text,
  last_name          text,
  -- if this legal person maps to a company we already track:
  linked_company_id  uuid references companies (id) on delete set null,
  normalized_name    text,                                  -- for dedup/matching
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists idx_persons_norm_name on persons using gin (normalized_name gin_trgm_ops);
create index if not exists idx_persons_linked     on persons (linked_company_id);

-- ── company_roles (board / supervisory / proxy / shareholder / partner) ───
create table if not exists company_roles (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references companies (id) on delete cascade,
  person_id        uuid not null references persons (id) on delete cascade,
  role_category    role_category not null,
  position         text,                                    -- e.g. 'President of the Board'
  shareholding_pct numeric(7,4),                            -- for shareholders
  shares_count     bigint,
  shares_value     numeric(18,2),
  appointed_at     date,
  ended_at         date,
  is_current       boolean not null default true,
  raw              jsonb,
  created_at       timestamptz not null default now()
);

create index if not exists idx_roles_company on company_roles (company_id);
create index if not exists idx_roles_person  on company_roles (person_id);
create index if not exists idx_roles_current on company_roles (is_current);

-- ── PKD activity codes ───────────────────────────────────────────────────
create table if not exists pkd_codes (
  code        text primary key,                             -- e.g. '62.01.Z'
  description text,
  section     text                                          -- e.g. 'J'
);

create table if not exists company_pkd (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies (id) on delete cascade,
  pkd_code    text not null references pkd_codes (code),
  is_primary  boolean not null default false,
  unique (company_id, pkd_code)
);

create index if not exists idx_company_pkd_company on company_pkd (company_id);
create index if not exists idx_company_pkd_code    on company_pkd (pkd_code);

-- ── ingestion audit ──────────────────────────────────────────────────────
create table if not exists ingestion_runs (
  id                 uuid primary key default gen_random_uuid(),
  source             text not null,                         -- ekrs_api / ekrs_scraper / rdf ...
  target_krs         text,
  status             text not null default 'pending',       -- pending/running/success/error
  records_processed  integer default 0,
  error              text,
  meta               jsonb,
  started_at         timestamptz not null default now(),
  finished_at        timestamptz
);

create index if not exists idx_ingestion_status on ingestion_runs (status);
create index if not exists idx_ingestion_krs    on ingestion_runs (target_krs);

-- ── updated_at trigger ───────────────────────────────────────────────────
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end; $$ language plpgsql;

drop trigger if exists trg_companies_updated on companies;
create trigger trg_companies_updated before update on companies
  for each row execute function set_updated_at();

drop trigger if exists trg_persons_updated on persons;
create trigger trg_persons_updated before update on persons
  for each row execute function set_updated_at();
