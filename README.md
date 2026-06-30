# Firmobase

Polish company intelligence platform — registry data, financial statements, government grants, and relationship graphs aggregated from public sources into one fast, modern interface.

> **Status:** Web app live at [firmobase-web.vercel.app](https://firmobase-web.vercel.app/).
> Phases 0–6 + 9 shipped (search, profiles, financials, analytics, relationship
> graph, grants, admin/monitoring). AI insights (7) and Stripe billing (8) were
> built then removed — see roadmap. **Next operational step:** deploy the
> scraping pipeline to a Hetzner VM to ingest data at scale.

## Stack

| Layer        | Tech                                                                 |
| ------------ | ------------------------------------------------------------------- |
| Frontend     | Next.js 15 (App Router), React 19, TypeScript, Tailwind v4, TanStack Query/Table, Recharts |
| Auth         | Clerk (email/password, Google, Microsoft, 2FA)                       |
| Database     | Supabase (PostgreSQL + storage + full-text search)                  |
| Backend      | Python 3.12, FastAPI, SQLAlchemy, Alembic                           |
| Jobs/queues  | Celery + Redis (Beat for schedules)                                  |
| Scraping     | Playwright + BeautifulSoup (eKRS RDF financial repository)           |
| AI           | OpenRouter (built in Phase 7, currently removed — see roadmap)       |
| Deploy       | Vercel (web, live) · Hetzner VM (pipeline, pending setup)            |

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

- **Phase 0** — Foundations (monorepo, auth, FastAPI/Celery skeleton, CI) ✅
- **Phase 1** — eKRS ingestion + core company schema + profile page + basic search ✅
- **Phase 2** — Search engine (full-text, filters, autocomplete) ✅
- **Phase 3** — Financial statement scraper + parser (Playwright RDF + e-sprawozdanie XML) ✅
- **Phase 4** — Financial analytics (ratios, scores, trends, charts) ✅
- **Phase 5** — Relationship graph (Cytoscape.js company↔person↔company) ✅
- **Phase 6** — Grants + extra public sources (PARP/NCBR/FENG ingestion + matching) ✅
- **Phase 7** — AI insights (OpenRouter) — built, then **removed** (token-abuse risk on a public button) ⏸️
- **Phase 8** — Premium (Stripe billing, watchlists) — built, then **removed** (Stripe needs business verification); watchlist schema/UI partly retained ⏸️
- **Phase 9** — Admin panel, monitoring, health endpoint, security headers, RLS hardening ✅

Removed phases (7, 8) remain recoverable from git history.

### Next: deploy the pipeline (Hetzner)

The web app reads Supabase; the Python pipeline (`services/pipeline`) *writes* to
it via the service-role key and is meant to run on a dedicated Hetzner VM (Docker
Compose: redis + api + worker + beat). Until it runs, the database holds only the
seed companies.

See [ARCHITECTURE.md](ARCHITECTURE.md) for the system design.

## Deploying the pipeline to Hetzner

The pipeline is a Docker Compose stack (redis + FastAPI api + Celery worker +
Celery beat). It runs on its own VM so scraping can run 24/7 without touching
Vercel or the web app. It is **not** exposed publicly — only the worker reaches
out to eKRS, and writes land in Supabase via the service-role key.

**1. Provision a VM**
Hetzner Cloud CX22/CX32 (2–4 vCPU, 4–8 GB), Ubuntu 24.04. Note the IP.

**2. Install Docker + clone**
```bash
apt update && apt install -y docker.io docker-compose-v2 git
systemctl enable --now docker
cd /opt && git clone https://github.com/basedshiloh/Firmobase.git firmobase
cd firmobase
```

**3. Configure `services/pipeline/.env`** (from `.env.example`)
```
DATABASE_URL=postgresql+psycopg://postgres.sdvmilvruasbwcffohin:PASSWORD@aws-0-eu-central-1.pooler.supabase.com:6543/postgres
SUPABASE_URL=https://sdvmilvruasbwcffohin.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...        # secret; never in the web app
REDIS_URL=redis://redis:6379/0
EKRS_API_BASE=https://api-krs.ms.gov.pl
EKRS_RATE_LIMIT_PER_MIN=30           # ministry blocks abusers — do not raise
ENVIRONMENT=production
```

**4. Build + run**
```bash
docker compose up --build -d
docker compose ps
curl http://localhost:8000/health
```

**5. Smoke test ingestion** (CD Projekt, KRS 0000006865)
```bash
curl -X POST "http://localhost:8000/ingest/ekrs/0000006865?sync=true"
curl -X POST "http://localhost:8000/ingest/financials/0000006865?company_id=6e06bbc6-6913-4f47-865c-f883ff9114c8"
docker compose logs worker --tail 50
```

**Security:** lock the box down — `ufw allow ssh && ufw enable`. Port 8000 stays
on localhost; never expose the service-role key or the API to the internet.

## Legal note

Only public, legally accessible government data is ingested. Scraping respects source terms and rate limits. GDPR handling is addressed in Phase 9.
