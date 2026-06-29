"""Ingestion control endpoints."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, HTTPException, Query

from app.ingest import EkrsNotFound, Registry, ingest_krs
from app.tasks import ingest_ekrs, scrape_financials

router = APIRouter(prefix="/ingest", tags=["ingest"])

RegistryQuery = Annotated[
    Registry, Query(description="P=entrepreneurs, S=associations")
]
SyncQuery = Annotated[
    bool, Query(description="Run inline instead of enqueuing a Celery task")
]


@router.post("/ekrs/{krs}")
def trigger_ekrs_ingest(
    krs: str,
    registry: RegistryQuery = Registry.entrepreneurs,
    sync: SyncQuery = False,
) -> dict:
    """Ingest a single KRS number.

    By default the work is enqueued to the Celery worker and a task id is
    returned. Pass `?sync=true` to run it inline (handy for local testing).
    """
    if not krs.isdigit() or len(krs) != 10:
        raise HTTPException(
            status_code=422,
            detail="KRS must be a 10-digit number (leading zeros preserved)",
        )

    if sync:
        try:
            result = ingest_krs(krs, registry)
        except EkrsNotFound as exc:
            raise HTTPException(
                status_code=404,
                detail=f"KRS {krs} not found in register {registry.value}",
            ) from exc
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(
                status_code=502, detail=f"eKRS ingest failed: {exc}"
            ) from exc
        return {
            "mode": "sync",
            "krs": result.krs,
            "company_id": result.company_id,
            "created": result.created,
            "roles": result.roles,
            "addresses": result.addresses,
            "pkd": result.pkd,
        }

    task = ingest_ekrs.delay(krs, registry.value)
    return {"mode": "async", "task_id": task.id, "krs": krs}


@router.post("/financials/{krs}")
def trigger_financial_scrape(krs: str, company_id: str) -> dict:
    """Scrape, parse and persist financial statements for a company from the RDF.

    Always asynchronous: this drives a headless browser and can take a while.
    `company_id` is the Firmobase internal id (the scrape attaches statements to
    that company).
    """
    if not krs.isdigit() or len(krs) != 10:
        raise HTTPException(
            status_code=422,
            detail="KRS must be a 10-digit number (leading zeros preserved)",
        )
    task = scrape_financials.delay(krs, company_id)
    return {"mode": "async", "task_id": task.id, "krs": krs, "company_id": company_id}
