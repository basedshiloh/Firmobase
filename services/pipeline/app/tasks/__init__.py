"""Celery tasks."""

import structlog

from app.celery_app import celery_app
from app.ingest import Registry, ingest_krs

log = structlog.get_logger(__name__)


@celery_app.task(name="app.tasks.ping")
def ping() -> str:
    """Smoke-test task to confirm worker + broker are wired up."""
    return "pong"


@celery_app.task(
    name="app.tasks.ingest_ekrs",
    bind=True,
    max_retries=3,
    default_retry_delay=60,
    acks_late=True,
)
def ingest_ekrs(self, krs: str, registry: str = "P") -> dict:
    """Fetch, parse and persist one KRS number from the eKRS API."""
    try:
        result = ingest_krs(krs, Registry(registry))
    except Exception as exc:  # noqa: BLE001
        # ingest_krs already recorded the failure in ingestion_runs; retry transient ones.
        log.warning("ingest_ekrs.retry", krs=krs, error=repr(exc))
        raise self.retry(exc=exc) from exc
    return {
        "krs": result.krs,
        "company_id": result.company_id,
        "created": result.created,
        "roles": result.roles,
        "addresses": result.addresses,
        "pkd": result.pkd,
    }


@celery_app.task(
    name="app.tasks.scrape_financials",
    bind=True,
    max_retries=2,
    default_retry_delay=300,
    acks_late=True,
)
def scrape_financials(self, krs: str, company_id: str) -> dict:
    """Scrape, store, parse and persist all financial statements for a company.

    Heavy task (drives a headless browser); retries are spaced widely so we do
    not hammer the ministry's RDF on transient failures.
    """
    # Imported lazily so the worker only pulls Playwright when this task runs.
    from app.ingest.financial_pipeline import scrape_company_financials

    try:
        result = scrape_company_financials(krs, company_id)
    except Exception as exc:  # noqa: BLE001
        log.warning("scrape_financials.retry", krs=krs, error=repr(exc))
        raise self.retry(exc=exc) from exc
    return {
        "krs": result.krs,
        "company_id": result.company_id,
        "documents_found": result.documents_found,
        "statements_parsed": result.statements_parsed,
        "statements_stored_only": result.statements_stored_only,
    }


@celery_app.task(name="app.tasks.ingest_ekrs_batch")
def ingest_ekrs_batch(krs_list: list[str], registry: str = "P") -> dict:
    """Fan a list of KRS numbers out to individual ingest tasks.

    Each number becomes its own `ingest_ekrs` task so failures are isolated and
    the per-task rate limiter spaces calls to the ministry API. Returns the
    enqueued count; the KRS enumeration strategy (range scan, RDF dump, ...)
    is a later-phase concern and lives upstream of this fan-out.
    """
    for krs in krs_list:
        ingest_ekrs.delay(krs, registry)
    log.info("ingest_ekrs_batch.enqueued", count=len(krs_list), registry=registry)
    return {"enqueued": len(krs_list), "registry": registry}


@celery_app.task(
    name="app.tasks.ingest_grants_batch",
    bind=True,
    max_retries=2,
    default_retry_delay=120,
    acks_late=True,
)
def ingest_grants_batch(self, program: str) -> dict:
    """Scrape and ingest all grants for a given program.

    Each program adapter (PARP, NCBR, FENG, etc.) yields GrantRecords.
    This task handles the full cycle: fetch → parse → upsert → match.
    """
    from app.db import SessionLocal
    from app.ingest.grant_ingest import ingest_grants
    from app.scrape.grant_scrapers import get_scraper

    try:
        scraper = get_scraper(program)
        records = scraper.fetch_all()
        with SessionLocal() as session:
            stats = ingest_grants(session, records)
    except Exception as exc:  # noqa: BLE001
        log.warning("ingest_grants.retry", program=program, error=repr(exc))
        raise self.retry(exc=exc) from exc
    return {"program": program, **stats}
