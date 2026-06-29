"""
Grant source scrapers for Polish government programs.

Each scraper class fetches grant data from a public source and returns
a list of GrantRecord objects. Currently includes:
- PARP (serwis beneficjenta)
- NCBR (lista projektów)
- FENG / POIR (mapy dotacji)

Sources publish data as CSVs, XLS files, or paginated HTML tables.
Scrapers are designed to run on the Hetzner pipeline worker.
"""

from __future__ import annotations

import csv
import io
from abc import ABC, abstractmethod

import httpx
import structlog

from app.ingest.grant_ingest import GrantRecord

logger = structlog.get_logger()


class BaseGrantScraper(ABC):
    """Base class for grant program scrapers."""

    program: str = ""

    @abstractmethod
    def fetch_all(self) -> list[GrantRecord]:
        ...


class ParpScraper(BaseGrantScraper):
    """Scraper for PARP (Polska Agencja Rozwoju Przedsiębiorczości).

    PARP publishes beneficiary lists as downloadable CSV/XLSX files.
    This scraper handles the CSV export format.
    """

    program = "PARP"

    def __init__(self, csv_url: str | None = None):
        self.csv_url = csv_url

    def fetch_all(self) -> list[GrantRecord]:
        if not self.csv_url:
            logger.warning("parp_scraper.no_url")
            return []

        resp = httpx.get(self.csv_url, timeout=60, follow_redirects=True)
        resp.raise_for_status()

        records: list[GrantRecord] = []
        reader = csv.DictReader(io.StringIO(resp.text))

        for row in reader:
            rec = GrantRecord(
                source_id=f"parp-{row.get('nr_umowy', row.get('lp', ''))}",
                program="PARP",
                program_year=_safe_int(row.get("rok")),
                title=row.get("tytul_projektu", row.get("nazwa_projektu", "")),
                description=row.get("opis"),
                beneficiary_name=row.get("beneficjent", row.get("nazwa_beneficjenta")),
                beneficiary_nip=row.get("nip"),
                amount_pln=_safe_float(row.get("wartosc_projektu", row.get("kwota_dofinansowania"))),
                amount_eu=_safe_float(row.get("dofinansowanie_ue")),
                start_date=_safe_date(row.get("data_rozpoczecia")),
                end_date=_safe_date(row.get("data_zakonczenia")),
                status=row.get("status"),
                voivodeship=row.get("wojewodztwo"),
                source_url=self.csv_url,
            )
            if rec.title:
                records.append(rec)

        logger.info("parp_scraper.done", count=len(records))
        return records


class MapaDotacjiScraper(BaseGrantScraper):
    """Scraper for Mapa Dotacji (mapadotacji.gov.pl).

    Covers FENG, POIR, and regional programs. The site exposes
    a JSON API for searching funded projects.
    """

    program = "FENG"
    BASE_URL = "https://mapadotacji.gov.pl/api"

    def __init__(self, program: str = "FENG", limit: int = 1000):
        self.program = program
        self.limit = limit

    def fetch_all(self) -> list[GrantRecord]:
        records: list[GrantRecord] = []
        page = 1
        per_page = 100

        while len(records) < self.limit:
            resp = httpx.get(
                f"{self.BASE_URL}/projects",
                params={
                    "programme": self.program,
                    "page": page,
                    "per_page": per_page,
                },
                timeout=30,
            )
            if resp.status_code != 200:
                logger.warning(
                    "mapadotacji.fetch_error",
                    status=resp.status_code,
                    page=page,
                )
                break

            data = resp.json()
            items = data.get("data", data) if isinstance(data, dict) else data
            if not items:
                break

            for item in items:
                rec = GrantRecord(
                    source_id=f"md-{item.get('id', '')}",
                    program=self.program,
                    program_year=_safe_int(
                        item.get("year") or item.get("call_year")
                    ),
                    title=item.get("title", item.get("name", "")),
                    description=item.get("description"),
                    beneficiary_name=item.get("beneficiary", {}).get("name")
                    if isinstance(item.get("beneficiary"), dict)
                    else item.get("beneficiary_name"),
                    beneficiary_nip=item.get("beneficiary", {}).get("nip")
                    if isinstance(item.get("beneficiary"), dict)
                    else item.get("nip"),
                    amount_pln=_safe_float(
                        item.get("total_value") or item.get("value")
                    ),
                    amount_eu=_safe_float(
                        item.get("eu_cofinancing") or item.get("eu_value")
                    ),
                    start_date=_safe_date(item.get("start_date")),
                    end_date=_safe_date(item.get("end_date")),
                    status=item.get("status"),
                    voivodeship=item.get("voivodeship")
                    or item.get("region"),
                    source_url=item.get("url"),
                )
                if rec.title:
                    records.append(rec)

            if len(items) < per_page:
                break
            page += 1

        logger.info(
            "mapadotacji_scraper.done",
            program=self.program,
            count=len(records),
        )
        return records


_SCRAPERS: dict[str, type[BaseGrantScraper]] = {
    "PARP": ParpScraper,
    "FENG": MapaDotacjiScraper,
    "POIR": MapaDotacjiScraper,
}


def get_scraper(program: str, **kwargs) -> BaseGrantScraper:  # type: ignore[no-untyped-def]
    cls = _SCRAPERS.get(program.upper())
    if not cls:
        raise ValueError(
            f"Unknown program: {program}. "
            f"Available: {list(_SCRAPERS.keys())}"
        )
    if cls is MapaDotacjiScraper:
        return cls(program=program.upper(), **kwargs)
    return cls(**kwargs)


def _safe_int(v: str | int | None) -> int | None:
    if v is None:
        return None
    try:
        return int(v)
    except (ValueError, TypeError):
        return None


def _safe_float(v: str | float | None) -> float | None:
    if v is None:
        return None
    try:
        return float(str(v).replace(",", ".").replace(" ", ""))
    except (ValueError, TypeError):
        return None


def _safe_date(v: str | None):  # type: ignore[no-untyped-def]
    if not v:
        return None
    from datetime import date as dt_date

    for fmt in ("%Y-%m-%d", "%d.%m.%Y", "%d-%m-%Y", "%Y/%m/%d"):
        try:
            return dt_date.fromisoformat(v) if fmt == "%Y-%m-%d" else None
        except ValueError:
            pass
        try:
            from datetime import datetime
            return datetime.strptime(v, fmt).date()
        except ValueError:
            continue
    return None
