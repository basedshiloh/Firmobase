# Firmobase

Polish company intelligence platform — registry data, financial statements, government grants, and relationship graphs aggregated from public sources into one fast, modern interface.

> **Status:** Phase 0 (foundations) complete. Phase 1 (eKRS ingestion + core schema) next.

## Stack

| Layer        | Tech                                                                 |
| ------------ | ------------------------------------------------------------------- |
| Frontend     | Next.js 15 (App Router), React 19, TypeScript, Tailwind v4, TanStack Query/Table, Recharts |
| Auth         | Clerk (email/password, Google, Microsoft, 2FA)                       |
| Database     | Supabase (PostgreSQL + storage + full-text search)                  |
| Backend      | Python 3.12, FastAPI, SQLAlchemy, Alembic                           |
| Jobs/queues  | Celery + Redis (Beat for schedules)                                  |
| Scraping     | Playwright + BeautifulSoup (Phase 3)                                 |
| AI           | Anthropic Claude (Phase 7)                                           |
| Deploy       | Vercel (web) now → Hetzner VM (pipeline) at scale                   |

## Repository layout

```
apps/web              Next.js frontend (deploys to Vercel)
services/pipeline     FastAPI + Celery ingestion/analytics service (Docker → Hetzner)
packages/             shared TS packages (added as needed)
docker-compose.yml    local dev stack (redis + api + worker + beat)
.github/workflows/    CI
```

## Local setup

### 1. Web
```bash
npm install
cp apps/web/.env.local.example apps/web/.env.local   # fill in Clerk + Supabase keys
npm run dev                                            # http://localhost:3000
```

### 2. Pipeline (requires Docker)
```bash
cp services/pipeline/.env.example services/pipeline/.env   # fill in DB + Redis
docker compose up --build                                  # API on :8000, /docs for OpenAPI
```

## Roadmap

- **Phase 0** — Foundations (this) ✅
- **Phase 1** — eKRS ingestion + core company schema + profile page + basic search
- **Phase 2** — Search engine (full-text, filters, autocomplete)
- **Phase 3** — Financial statement scraper + parser
- **Phase 4** — Financial analytics (ratios, scores, trends, charts)
- **Phase 5** — Relationship graph
- **Phase 6** — Grants + extra public sources
- **Phase 7** — AI insights
- **Phase 8** — Premium (Stripe, watchlists, alerts, exports, API)
- **Phase 9** — Admin panel, monitoring, hardening

See [ARCHITECTURE.md](ARCHITECTURE.md) for the system design.
```

## Legal note

Only public, legally accessible government data is ingested. Scraping respects source terms and rate limits. GDPR handling is addressed in Phase 9.
