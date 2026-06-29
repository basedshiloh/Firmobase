-- ─────────────────────────────────────────────────────────────────────────
-- Firmobase — Row Level Security
-- Posture: public READ on company data (registry/financials are public record),
-- NO public write (only the service-role pipeline writes; it bypasses RLS).
-- ingestion_runs is internal operational data: RLS on, no public policy at all.
-- ─────────────────────────────────────────────────────────────────────────

-- Public-readable company data tables.
do $$
declare t text;
begin
  foreach t in array array[
    'companies',
    'company_addresses',
    'persons',
    'company_roles',
    'pkd_codes',
    'company_pkd',
    'financial_reports',
    'financial_line_items'
  ]
  loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists public_read on public.%I;', t);
    -- SELECT only. No INSERT/UPDATE/DELETE policy => anon writes are denied.
    execute format(
      'create policy public_read on public.%I for select to anon, authenticated using (true);',
      t
    );
  end loop;
end $$;

-- Internal audit log: lock down completely for anon/authenticated.
-- (service_role bypasses RLS, so the pipeline can still write.)
alter table public.ingestion_runs enable row level security;
drop policy if exists public_read on public.ingestion_runs;
