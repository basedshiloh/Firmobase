# Firmobase — Architecture

## High-level

```
                 ┌────────────────────────────────────────────┐
                 │              Public data sources             │
                 │  eKRS API · eKRS financial docs · GUS ·      │
                 │  CEIDG · VAT whitelist · MSiG · grant DBs    │
                 └───────────────────────┬────────────────────┘
                                         │
                  ┌──────────────────────▼───────────────────────┐
                  │      Pipeline service (FastAPI + Celery)       │
                  │  ingest → scrape → parse → normalize →         │
                  │  relate → grant-match → index → summarize      │
                  └──────────────────────┬───────────────────────┘
                                         │ writes (service role)
                  ┌──────────────────────▼───────────────────────┐
                  │            Supabase (PostgreSQL)               │
                  │  companies · people · roles · financials ·     │
                  │  grants · edges · search index · storage(PDF)  │
                  └──────────────────────┬───────────────────────┘
                                         │ reads (anon key + RLS)
                  ┌──────────────────────▼───────────────────────┐
                  │         Web app (Next.js on Vercel)            │
                  │  search · company profile · charts · graph ·   │
                  │  dashboard · admin · billing                   │
                  └────────────────────────────────────────────────┘
                            Auth: Clerk   ·   AI: Claude
```

## Why this split

- **Web (Vercel)** handles UI, auth, and read queries directly against Supabase with RLS. Fast to ship, scales automatically, no server ops.
- **Pipeline (Hetzner later)** does the heavy, long-running, stateful work (scraping, parsing, batch ingestion) that doesn't fit serverless. Runs in Docker; identical locally and in production.
- **Supabase** is the single source of truth. The pipeline writes with the service-role key; the web app reads with the anon key under row-level security.

## Deployment path

1. **Now:** web on Vercel; pipeline in local Docker against a dedicated Supabase project.
2. **At scale:** provision a Hetzner VM, run the same `docker compose` stack (api + worker + beat + redis), point Vercel's `NEXT_PUBLIC_API_URL` at it. Optionally move Postgres self-hosted; SQLAlchemy/Alembic make this portable.

## Data model (evolves per phase)

Phase 1 introduces the spine: `companies`, `people`, `company_roles` (board/supervisory/proxy/shareholder with start/end dates), `addresses`, `pkd_codes`, `company_pkd`, plus an `ingestion_runs` audit table. Financials (Phase 3), grants (Phase 6), and graph edges (Phase 5) attach to `companies`/`people` by stable internal IDs keyed off KRS/NIP/REGON.

## Search

Start with PostgreSQL full-text + trigram (`pg_trgm`) for typo tolerance and autocomplete — sufficient to millions of rows with proper GIN indexes. Migrate hot paths to OpenSearch only if/when needed.

## Security

Clerk for auth (SSO + 2FA). RLS on all user-scoped tables. Service-role key never reaches the browser. Rate limiting and audit logs in Phase 9. Only public data; GDPR review before public launch.
