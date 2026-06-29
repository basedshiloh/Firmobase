-- ─────────────────────────────────────────────────────────────────────────
-- Firmobase — Phase 3: financial statements (eKRS RDF / e-sprawozdania)
-- Source of truth for DB structure. ORM models in services/pipeline mirror this.
-- ─────────────────────────────────────────────────────────────────────────

-- ── enums ────────────────────────────────────────────────────────────────
do $$ begin
  create type statement_kind as enum (
    'balance_sheet',   -- bilans
    'profit_loss',     -- rachunek zysków i strat
    'cash_flow',       -- rachunek przepływów pieniężnych
    'equity_changes',  -- zestawienie zmian w kapitale własnym
    'notes'            -- informacja dodatkowa / noty
  );
exception when duplicate_object then null; end $$;

-- ── financial_reports: one filing per company per fiscal period ───────────
create table if not exists financial_reports (
  id                   uuid primary key default gen_random_uuid(),
  company_id           uuid not null references companies (id) on delete cascade,
  fiscal_year          integer not null,
  period_start         date,
  period_end           date,
  consolidated         boolean not null default false,
  currency             text default 'PLN',
  -- provenance
  source               text default 'ekrs_rdf',
  source_document_id   text,                 -- RDF document identifier
  original_format      text,                 -- 'xml' | 'pdf'
  storage_path         text,                 -- path in Supabase Storage to original
  content_hash         text,                 -- dedup / integrity
  filed_date           date,
  parsed               boolean not null default false,
  parse_error          text,
  -- denormalized headline figures (extracted during normalization, for fast
  -- display / sorting / search; full detail lives in financial_line_items)
  revenue              numeric(20,2),
  operating_profit     numeric(20,2),
  net_profit           numeric(20,2),
  total_assets         numeric(20,2),
  total_equity         numeric(20,2),
  total_liabilities    numeric(20,2),
  cash                 numeric(20,2),
  raw                  jsonb,                 -- parsed structured dump
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (company_id, fiscal_year, consolidated)
);

create index if not exists idx_fin_reports_company on financial_reports (company_id);
create index if not exists idx_fin_reports_year    on financial_reports (fiscal_year);
create index if not exists idx_fin_reports_hash    on financial_reports (content_hash);

-- ── financial_line_items: every available financial field (EAV-style) ─────
create table if not exists financial_line_items (
  id          uuid primary key default gen_random_uuid(),
  report_id   uuid not null references financial_reports (id) on delete cascade,
  statement   statement_kind not null,
  section     text,                          -- e.g. 'assets', 'liabilities', 'operating'
  code        text,                          -- taxonomy position, e.g. 'A.I.1'
  label       text not null,                 -- Polish label from the statement
  label_en    text,                          -- optional English mapping
  value       numeric(20,2),                 -- current period
  prev_value  numeric(20,2),                 -- comparative prior period
  ordinal     integer,                       -- display order within statement
  depth       integer default 0,             -- nesting level for indentation
  created_at  timestamptz not null default now()
);

create index if not exists idx_fin_items_report on financial_line_items (report_id);
create index if not exists idx_fin_items_stmt   on financial_line_items (report_id, statement);

-- ── updated_at trigger (reuses set_updated_at from core schema) ───────────
drop trigger if exists trg_fin_reports_updated on financial_reports;
create trigger trg_fin_reports_updated before update on financial_reports
  for each row execute function set_updated_at();
