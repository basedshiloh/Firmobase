"""
Grant ingestion — upserts grants and links them to companies.

Designed to work with multiple Polish grant program sources:
- PARP (polska agencja rozwoju przedsiębiorczości)
- NCBR (narodowe centrum badań i rozwoju)
- FENG (fundusze europejskie dla nowoczesnej gospodarki)
- POIR (program operacyjny inteligentny rozwój)
- Regional operational programs

Each source adapter produces a list of GrantRecord dicts;
this module handles deduplication, upsert, and company matching.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date

import structlog
from sqlalchemy import select, text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.models.grants import CompanyGrant, Grant

logger = structlog.get_logger()


@dataclass
class GrantRecord:
    """Normalized grant record from any source."""

    source_id: str
    program: str
    program_year: int | None
    title: str
    description: str | None
    beneficiary_name: str | None
    beneficiary_nip: str | None
    amount_pln: float | None
    amount_eu: float | None
    start_date: date | None
    end_date: date | None
    status: str | None
    voivodeship: str | None
    source_url: str | None


def upsert_grant(session: Session, rec: GrantRecord) -> str:
    """Upsert a single grant by source_id, return grant id."""
    stmt = (
        pg_insert(Grant)
        .values(
            source_id=rec.source_id,
            program=rec.program,
            program_year=rec.program_year,
            title=rec.title,
            description=rec.description,
            beneficiary_name=rec.beneficiary_name,
            amount_pln=rec.amount_pln,
            amount_eu=rec.amount_eu,
            start_date=rec.start_date,
            end_date=rec.end_date,
            status=rec.status,
            voivodeship=rec.voivodeship,
            source_url=rec.source_url,
        )
        .on_conflict_do_update(
            index_elements=["source_id"],
            set_={
                "title": rec.title,
                "description": rec.description,
                "amount_pln": rec.amount_pln,
                "amount_eu": rec.amount_eu,
                "start_date": rec.start_date,
                "end_date": rec.end_date,
                "status": rec.status,
                "voivodeship": rec.voivodeship,
                "source_url": rec.source_url,
            },
        )
        .returning(Grant.id)
    )
    result = session.execute(stmt)
    return result.scalar_one()


def _normalize_for_match(name: str) -> str:
    """Normalize company name for fuzzy matching."""
    name = name.upper()
    name = re.sub(
        r"\b(SP(?:ÓŁKA|\.)?\s*(?:Z\s*O\.?\s*O\.?|AKCYJNA|KOMANDYTOWA"
        r"|JAWNA|PARTNERSKA|CYWILNA)|S\.?A\.?|SP\.?\s*Z\.?\s*O\.?\s*O\.?"
        r"|S\.?K\.?A\.?)\b",
        "",
        name,
    )
    name = re.sub(r"[^A-ZĄĆĘŁŃÓŚŹŻ0-9\s]", "", name)
    return " ".join(name.split())


def match_to_company(
    session: Session, grant_id: str, rec: GrantRecord
) -> bool:
    """Try to link a grant to a company. Returns True if matched."""
    # 1. Exact NIP match (highest confidence)
    if rec.beneficiary_nip:
        nip_clean = re.sub(r"\D", "", rec.beneficiary_nip)
        row = session.execute(
            text("SELECT id FROM companies WHERE nip = :nip"),
            {"nip": nip_clean},
        ).first()
        if row:
            _link(session, row[0], grant_id, "nip", 1.0)
            return True

    # 2. Name similarity match
    if rec.beneficiary_name:
        normalized = _normalize_for_match(rec.beneficiary_name)
        row = session.execute(
            text(
                "SELECT id, similarity(name, :name) AS sim "
                "FROM companies "
                "WHERE name % :name "
                "ORDER BY sim DESC LIMIT 1"
            ),
            {"name": normalized},
        ).first()
        if row and row[1] >= 0.4:
            _link(session, row[0], grant_id, "name", float(row[1]))
            return True

    return False


def _link(
    session: Session,
    company_id: str,
    grant_id: str,
    method: str,
    score: float,
) -> None:
    stmt = (
        pg_insert(CompanyGrant)
        .values(
            company_id=company_id,
            grant_id=grant_id,
            match_method=method,
            match_score=score,
        )
        .on_conflict_do_nothing(
            index_elements=["company_id", "grant_id"]
        )
    )
    session.execute(stmt)


def ingest_grants(
    session: Session, records: list[GrantRecord]
) -> dict[str, int]:
    """Bulk ingest grants and match to companies."""
    stats = {"upserted": 0, "matched": 0, "unmatched": 0}

    for rec in records:
        grant_id = upsert_grant(session, rec)
        stats["upserted"] += 1

        if match_to_company(session, grant_id, rec):
            stats["matched"] += 1
        else:
            stats["unmatched"] += 1

    session.commit()
    logger.info("grant_ingest_complete", **stats)
    return stats
