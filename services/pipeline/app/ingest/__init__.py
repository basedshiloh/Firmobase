"""eKRS ingestion: fetch the Ministry of Justice KRS API, parse the odpis
payload, and upsert it into the company registry spine.

Public entry points:
    EkrsClient      -- thin HTTP client over api-krs.ms.gov.pl
    parse_odpis     -- pure transform: raw payload -> ParsedCompany
    ingest_krs      -- fetch + parse + persist a single KRS number
"""

from app.ingest.ekrs_client import EkrsApiError, EkrsClient, EkrsNotFound, Registry
from app.ingest.ekrs_ingest import IngestResult, ingest_krs
from app.ingest.ekrs_parser import ParsedCompany, parse_odpis

__all__ = [
    "EkrsApiError",
    "EkrsClient",
    "EkrsNotFound",
    "IngestResult",
    "ParsedCompany",
    "Registry",
    "ingest_krs",
    "parse_odpis",
]
