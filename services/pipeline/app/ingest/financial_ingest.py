"""Persist parsed financial statements into financial_reports + line items.

Idempotent per (company_id, fiscal_year, consolidated): re-ingesting a period
upserts the report row and full-refreshes its line items, so re-parsing an
improved extract converges rather than duplicating. Every attempt is recorded in
`ingestion_runs`.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from datetime import UTC, date, datetime

import structlog
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.db import SessionLocal
from app.models.core import IngestionRun
from app.models.financials import FinancialLineItem, FinancialReport
from app.parse.financial_parser import ParsedFinancials

log = structlog.get_logger(__name__)

SOURCE = "ekrs_rdf"


@dataclass
class FinancialIngestResult:
    company_id: str
    report_id: str
    fiscal_year: int
    created: bool
    line_items: int


def ingest_financials(
    company_id: str,
    parsed: ParsedFinancials,
    *,
    consolidated: bool = False,
    source_document_id: str | None = None,
    original_format: str | None = None,
    storage_path: str | None = None,
    raw_bytes: bytes | None = None,
    filed_date: date | None = None,
    session: Session | None = None,
) -> FinancialIngestResult:
    """Upsert one fiscal period of financials for a company."""
    if parsed.fiscal_year is None:
        raise ValueError("ParsedFinancials has no fiscal_year; cannot persist")

    owns_session = session is None
    session = session or SessionLocal()

    run = IngestionRun(source=SOURCE, target_krs=None, status="running")
    session.add(run)
    session.flush()

    try:
        result = _persist(
            session,
            company_id,
            parsed,
            consolidated=consolidated,
            source_document_id=source_document_id,
            original_format=original_format,
            storage_path=storage_path,
            content_hash=hashlib.sha256(raw_bytes).hexdigest() if raw_bytes else None,
            filed_date=filed_date,
        )
        run.status = "success"
        run.records_processed = result.line_items
        run.finished_at = datetime.now(UTC)
        run.meta = {
            "company_id": company_id,
            "fiscal_year": result.fiscal_year,
            "line_items": result.line_items,
            "created": result.created,
        }
        if owns_session:
            session.commit()
        return result
    except Exception as exc:
        session.rollback()
        run.status = "error"
        run.error = repr(exc)[:1000]
        run.finished_at = datetime.now(UTC)
        if owns_session:
            session.commit()
        log.error("financial_ingest.failed", company_id=company_id, error=repr(exc))
        raise
    finally:
        if owns_session:
            session.close()


def _persist(
    session: Session,
    company_id: str,
    parsed: ParsedFinancials,
    *,
    consolidated: bool,
    source_document_id: str | None,
    original_format: str | None,
    storage_path: str | None,
    content_hash: str | None,
    filed_date: date | None,
) -> FinancialIngestResult:
    report = session.scalar(
        select(FinancialReport).where(
            FinancialReport.company_id == company_id,
            FinancialReport.fiscal_year == parsed.fiscal_year,
            FinancialReport.consolidated == consolidated,
        )
    )
    created = report is None
    if report is None:
        report = FinancialReport(
            company_id=company_id,
            fiscal_year=parsed.fiscal_year,
            consolidated=consolidated,
        )
        session.add(report)

    report.period_start = parsed.period_start
    report.period_end = parsed.period_end
    report.currency = parsed.currency
    report.source = SOURCE
    report.source_document_id = source_document_id
    report.original_format = original_format
    report.storage_path = storage_path
    report.content_hash = content_hash
    report.filed_date = filed_date
    report.parsed = True
    report.parse_error = None
    report.revenue = parsed.revenue
    report.operating_profit = parsed.operating_profit
    report.net_profit = parsed.net_profit
    report.total_assets = parsed.total_assets
    report.total_equity = parsed.total_equity
    report.total_liabilities = parsed.total_liabilities
    report.cash = parsed.cash
    session.flush()

    # Full-refresh line items for this report.
    session.execute(
        delete(FinancialLineItem).where(FinancialLineItem.report_id == report.id)
    )
    for li in parsed.line_items:
        session.add(
            FinancialLineItem(
                report_id=report.id,
                statement=li.statement,
                section=li.section,
                code=li.code,
                label=li.label,
                label_en=None,
                value=li.value,
                prev_value=li.prev_value,
                ordinal=li.ordinal,
                depth=li.depth,
            )
        )

    session.flush()
    return FinancialIngestResult(
        company_id=company_id,
        report_id=report.id,
        fiscal_year=parsed.fiscal_year,
        created=created,
        line_items=len(parsed.line_items),
    )
