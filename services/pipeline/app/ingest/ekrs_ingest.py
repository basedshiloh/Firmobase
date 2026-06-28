"""Fetch + parse + persist a single KRS number into the company spine.

Idempotent: companies are upserted by KRS, and their dependent rows
(addresses, roles, pkd links) are full-refreshed from the latest payload so a
re-ingest converges to the current registry state rather than accumulating
duplicates. Every attempt is recorded in `ingestion_runs`.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime

import structlog
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.db import SessionLocal
from app.ingest.ekrs_client import EkrsClient, EkrsNotFound, Registry
from app.ingest.ekrs_parser import ParsedCompany, ParsedPerson, parse_odpis
from app.models.core import (
    Company,
    CompanyAddress,
    CompanyPkd,
    CompanyRole,
    IngestionRun,
    Person,
    PkdCode,
)

log = structlog.get_logger(__name__)

SOURCE = "ekrs_api"


@dataclass
class IngestResult:
    krs: str
    company_id: str
    created: bool
    roles: int
    addresses: int
    pkd: int


def ingest_krs(
    krs: str,
    registry: Registry = Registry.entrepreneurs,
    *,
    client: EkrsClient | None = None,
    session: Session | None = None,
) -> IngestResult:
    """Ingest one KRS number. Opens its own client/session unless injected."""
    krs = krs.strip()
    owns_session = session is None
    session = session or SessionLocal()
    owns_client = client is None
    client = client or EkrsClient()

    run = IngestionRun(source=SOURCE, target_krs=krs, status="running")
    session.add(run)
    session.flush()

    try:
        payload = client.fetch_current(krs, registry)
        parsed = parse_odpis(payload)
        result = _persist(session, parsed)

        run.status = "success"
        run.records_processed = result.roles + result.addresses + result.pkd
        run.finished_at = datetime.now(UTC)
        run.meta = {
            "created": result.created,
            "roles": result.roles,
            "addresses": result.addresses,
            "pkd": result.pkd,
        }
        session.commit()
        log.info(
            "ekrs.ingest.success",
            krs=krs,
            created=result.created,
            roles=result.roles,
            pkd=result.pkd,
        )
        return result
    except EkrsNotFound as exc:
        session.rollback()
        _fail_run(session, krs, str(exc), status="not_found")
        raise
    except Exception as exc:  # noqa: BLE001 - record then re-raise
        session.rollback()
        _fail_run(session, krs, repr(exc), status="error")
        log.error("ekrs.ingest.error", krs=krs, error=repr(exc))
        raise
    finally:
        if owns_client:
            client.close()
        if owns_session:
            session.close()


def _fail_run(session: Session, krs: str, error: str, status: str) -> None:
    """Record a failed run in its own committed row (rollback wiped the first)."""
    run = IngestionRun(
        source=SOURCE,
        target_krs=krs,
        status=status,
        error=error[:2000],
        finished_at=datetime.now(UTC),
    )
    session.add(run)
    session.commit()


def _persist(session: Session, parsed: ParsedCompany) -> IngestResult:
    company = session.scalar(select(Company).where(Company.krs == parsed.krs))
    created = company is None
    if company is None:
        company = Company(krs=parsed.krs, name=parsed.name)
        session.add(company)

    company.name = parsed.name
    company.nip = parsed.nip
    company.regon = parsed.regon
    company.legal_form = parsed.legal_form
    company.status = parsed.status
    company.ekrs_section = parsed.ekrs_section
    company.registry_court = parsed.registry_court
    company.registration_date = parsed.registration_date
    company.share_capital = parsed.share_capital
    company.share_capital_currency = parsed.share_capital_currency
    company.website = parsed.website
    company.email = parsed.email
    company.phone = parsed.phone
    company.source = SOURCE
    company.last_ingested_at = datetime.now(UTC)
    company.raw = parsed.raw
    session.flush()  # ensure company.id is populated

    _refresh_addresses(session, company, parsed)
    n_roles = _refresh_roles(session, company, parsed)
    n_pkd = _refresh_pkd(session, company, parsed)

    return IngestResult(
        krs=parsed.krs,
        company_id=company.id,
        created=created,
        roles=n_roles,
        addresses=len(parsed.addresses),
        pkd=n_pkd,
    )


def _refresh_addresses(session: Session, company: Company, parsed: ParsedCompany) -> None:
    session.execute(
        delete(CompanyAddress).where(CompanyAddress.company_id == company.id)
    )
    for a in parsed.addresses:
        session.add(
            CompanyAddress(
                company_id=company.id,
                address_type=a.address_type,
                street=a.street,
                building_no=a.building_no,
                apartment_no=a.apartment_no,
                postal_code=a.postal_code,
                city=a.city,
                commune=a.commune,
                district=a.district,
                voivodeship=a.voivodeship,
                country=a.country,
                raw=a.raw,
            )
        )


def _refresh_roles(session: Session, company: Company, parsed: ParsedCompany) -> int:
    # Drop this company's existing roles, then clean up any persons that are now
    # orphaned (no remaining roles and not linked to a company).
    old_person_ids = set(
        session.scalars(
            select(CompanyRole.person_id).where(CompanyRole.company_id == company.id)
        )
    )
    session.execute(delete(CompanyRole).where(CompanyRole.company_id == company.id))
    session.flush()

    # De-dupe persons within this payload so one human holding two roles maps to
    # a single person row.
    person_cache: dict[tuple, Person] = {}
    count = 0
    for role in parsed.roles:
        person = _get_or_create_person(session, role.person, person_cache)
        session.add(
            CompanyRole(
                company_id=company.id,
                person_id=person.id,
                role_category=role.role_category,
                position=role.position,
                is_current=True,
                raw=role.raw,
            )
        )
        count += 1
    session.flush()

    _cleanup_orphan_persons(session, old_person_ids)
    return count


def _get_or_create_person(
    session: Session, parsed: ParsedPerson, cache: dict[tuple, Person]
) -> Person:
    key = (parsed.person_type, parsed.normalized_name or parsed.full_name)
    if key in cache:
        return cache[key]
    person = Person(
        person_type=parsed.person_type,
        full_name=parsed.full_name,
        first_name=parsed.first_name,
        last_name=parsed.last_name,
        normalized_name=parsed.normalized_name,
    )
    session.add(person)
    session.flush()
    cache[key] = person
    return person


def _cleanup_orphan_persons(session: Session, person_ids: set[str]) -> None:
    if not person_ids:
        return
    for pid in person_ids:
        person = session.get(Person, pid)
        if person is None:
            continue
        has_roles = session.scalar(
            select(CompanyRole.id).where(CompanyRole.person_id == pid).limit(1)
        )
        if has_roles is None and person.linked_company_id is None:
            session.delete(person)


def _refresh_pkd(session: Session, company: Company, parsed: ParsedCompany) -> int:
    session.execute(delete(CompanyPkd).where(CompanyPkd.company_id == company.id))
    session.flush()

    seen: set[str] = set()
    count = 0
    for p in parsed.pkd:
        if p.code in seen:
            continue
        seen.add(p.code)
        # Ensure the pkd_codes dictionary row exists (FK target).
        if session.get(PkdCode, p.code) is None:
            session.add(
                PkdCode(code=p.code, description=p.description, section=p.section)
            )
            session.flush()
        session.add(
            CompanyPkd(company_id=company.id, pkd_code=p.code, is_primary=p.is_primary)
        )
        count += 1
    return count
