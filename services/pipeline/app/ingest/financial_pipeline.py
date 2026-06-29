"""End-to-end financial pipeline: scrape RDF → store original → parse → persist.

Ties the pieces together for one company:

    RdfScraper.list_documents(krs)        # find filed statements
      → download each financial statement # original bytes
      → upload_original(...)              # keep the source in Storage
      → parse_esprawozdanie(xml)          # structured XML → normalized facts
      → ingest_financials(...)           # upsert report + line items

XML statements are parsed into structured data. PDF-only (older, scanned)
statements are stored as originals and recorded with ``parsed = false`` — PDF
table extraction is a later enhancement and intentionally out of scope here.
"""

from __future__ import annotations

from dataclasses import dataclass

import structlog

from app.parse.financial_parser import parse_esprawozdanie
from app.scrape import RdfScraper
from app.scrape.storage import upload_original

log = structlog.get_logger(__name__)


@dataclass
class FinancialPipelineResult:
    krs: str
    company_id: str
    documents_found: int
    statements_parsed: int
    statements_stored_only: int


def scrape_company_financials(krs: str, company_id: str) -> FinancialPipelineResult:
    """Scrape, store, parse and persist all financial statements for a company."""
    # Imported here so the module imports cleanly without DB/SQLAlchemy at parse time.
    from app.ingest.financial_ingest import ingest_financials

    parsed_count = 0
    stored_only = 0

    with RdfScraper() as scraper:
        docs = scraper.list_documents(krs)
        statements = [d for d in docs if d.is_financial_statement]
        log.info(
            "financial_pipeline.start",
            krs=krs,
            documents=len(docs),
            statements=len(statements),
        )

        for doc in statements:
            data = scraper.download(doc)
            ext = doc.original_format or ("xml" if data[:64].lstrip().startswith(b"<") else "pdf")
            object_path = f"{krs}/{doc.fiscal_year or 'unknown'}/{doc.document_id}.{ext}"
            content_type = "application/xml" if ext == "xml" else "application/pdf"
            storage_path = upload_original(object_path, data, content_type)

            if ext == "xml":
                try:
                    parsed = parse_esprawozdanie(data)
                    ingest_financials(
                        company_id,
                        parsed,
                        source_document_id=doc.document_id,
                        original_format="xml",
                        storage_path=storage_path,
                        raw_bytes=data,
                        filed_date=doc.filed_date,
                    )
                    parsed_count += 1
                except Exception as exc:  # noqa: BLE001 - one bad doc shouldn't stop the batch
                    log.warning(
                        "financial_pipeline.parse_failed",
                        document_id=doc.document_id,
                        error=repr(exc),
                    )
                    stored_only += 1
            else:
                # PDF-only: original is stored; structured parse not attempted yet.
                stored_only += 1

    return FinancialPipelineResult(
        krs=krs,
        company_id=company_id,
        documents_found=len(docs),
        statements_parsed=parsed_count,
        statements_stored_only=stored_only,
    )
