"""Scraper for the eKRS financial document repository (RDF).

Financial statements are NOT exposed by the eKRS open-data API. They live in the
"Repozytorium Dokumentów Finansowych" browser SPA, now served from
``https://rdf-przegladarka.ms.gov.pl`` behind a BigIP load balancer that issues a
session cookie and requires JavaScript. A plain HTTP client gets redirect-looped,
so we drive a real headless browser (Playwright) to:

    1. establish the BigIP session by loading the SPA,
    2. search by KRS number,
    3. read the list of filed documents (captured from the SPA's own JSON API),
    4. download each document's bytes (XML for e-sprawozdania, PDF for scans).

The SPA's DOM changes occasionally; selectors and API URL fragments are kept as
module-level constants so they are easy to update in one place. We prefer
capturing the SPA's network responses over scraping rendered DOM, because the
JSON payload is far more stable than the markup.

Requires the ``scraping`` extra:  pip install ".[scraping]"  +  playwright install chromium
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date

import structlog

log = structlog.get_logger(__name__)

RDF_BASE_URL = "https://rdf-przegladarka.ms.gov.pl"

# Fragments that identify the SPA's backend calls in captured network traffic.
# Update these if the ministry changes its API paths.
SEARCH_API_FRAGMENT = "/api/wyszukiwanie"          # KRS search results
DOCUMENT_LIST_FRAGMENT = "/dokumenty"               # filing/document listing
DOWNLOAD_PATH_TEMPLATE = "/api/pobierzPlik/{doc_id}"  # document download

# DOM selectors (fallbacks / interaction points).
SEL_KRS_INPUT = "input[name='krs'], input#krs, input[formcontrolname='krs']"
SEL_SEARCH_BUTTON = "button[type='submit'], button.szukaj, button:has-text('Szukaj')"
SEL_RESULT_ROW = "table tbody tr, .wynik-wyszukiwania"

DEFAULT_TIMEOUT_MS = 30_000


class RdfScrapeError(RuntimeError):
    """Recoverable/diagnostic error while scraping the RDF."""


@dataclass
class RdfDocument:
    """One financial document available for a company in the RDF."""

    document_id: str
    title: str
    fiscal_year: int | None = None
    period_start: date | None = None
    period_end: date | None = None
    filed_date: date | None = None
    document_kind: str | None = None          # e.g. 'sprawozdanie finansowe'
    original_format: str | None = None        # 'xml' | 'pdf'
    content: bytes | None = None              # populated by download()
    raw_meta: dict = field(default_factory=dict)

    @property
    def is_financial_statement(self) -> bool:
        t = (self.document_kind or self.title or "").lower()
        return "sprawozdanie finansowe" in t or "bilans" in t


def _parse_pl_date(value: str | None) -> date | None:
    if not value:
        return None
    value = value.strip()
    for fmt_re, order in (
        (r"^(\d{4})-(\d{2})-(\d{2})", "ymd"),
        (r"^(\d{2})\.(\d{2})\.(\d{4})", "dmy"),
    ):
        m = re.match(fmt_re, value)
        if m:
            a, b, c = m.groups()
            try:
                if order == "ymd":
                    return date(int(a), int(b), int(c))
                return date(int(c), int(b), int(a))
            except ValueError:
                return None
    return None


class RdfScraper:
    """Headless-browser scraper for the RDF. Use as a context manager.

        with RdfScraper() as scraper:
            docs = scraper.list_documents("0000006865")
            for doc in docs:
                if doc.is_financial_statement:
                    scraper.download(doc)
    """

    def __init__(self, headless: bool = True, timeout_ms: int = DEFAULT_TIMEOUT_MS) -> None:
        self._headless = headless
        self._timeout = timeout_ms
        self._pw = None
        self._browser = None
        self._context = None
        self._page = None
        self._captured: list[dict] = []

    def __enter__(self) -> RdfScraper:
        self._start()
        return self

    def __exit__(self, *_exc: object) -> None:
        self.close()

    def _start(self) -> None:
        try:
            from playwright.sync_api import sync_playwright
        except ImportError as exc:  # pragma: no cover - env guard
            raise RdfScrapeError(
                "Playwright is required for RDF scraping. Install with "
                "pip install '.[scraping]' and run 'playwright install chromium'."
            ) from exc

        self._pw = sync_playwright().start()
        self._browser = self._pw.chromium.launch(headless=self._headless)
        self._context = self._browser.new_context(
            locale="pl-PL",
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
            ),
        )
        self._page = self._context.new_page()
        self._page.set_default_timeout(self._timeout)
        # Capture every JSON response the SPA receives; we mine it for metadata.
        self._page.on("response", self._on_response)

    def _on_response(self, response) -> None:  # noqa: ANN001 - playwright type
        url = response.url
        if SEARCH_API_FRAGMENT in url or DOCUMENT_LIST_FRAGMENT in url:
            try:
                self._captured.append({"url": url, "json": response.json()})
            except Exception:  # noqa: BLE001 - non-JSON or stream; ignore
                pass

    def close(self) -> None:
        for obj, meth in (
            (self._context, "close"),
            (self._browser, "close"),
            (self._pw, "stop"),
        ):
            try:
                if obj is not None:
                    getattr(obj, meth)()
            except Exception:  # noqa: BLE001
                pass

    # ── public API ────────────────────────────────────────────────────────

    def list_documents(self, krs: str) -> list[RdfDocument]:
        """Search the RDF for a KRS and return its available documents."""
        if self._page is None:
            raise RdfScrapeError("Scraper not started; use as a context manager.")

        self._captured.clear()
        log.info("rdf.search.start", krs=krs)

        # 1) Load the SPA to obtain the BigIP session cookie.
        self._page.goto(RDF_BASE_URL, wait_until="networkidle")

        # 2) Enter the KRS and search.
        try:
            self._page.fill(SEL_KRS_INPUT, krs)
            self._page.click(SEL_SEARCH_BUTTON)
        except Exception as exc:  # noqa: BLE001 - selector drift
            raise RdfScrapeError(
                f"Could not drive RDF search form (selectors may have changed): {exc}"
            ) from exc

        # 3) Wait for the SPA's data call, then mine captured JSON.
        try:
            self._page.wait_for_response(
                lambda r: DOCUMENT_LIST_FRAGMENT in r.url or SEARCH_API_FRAGMENT in r.url,
                timeout=self._timeout,
            )
        except Exception:  # noqa: BLE001 - fall through to whatever we captured
            log.warning("rdf.search.no_api_capture", krs=krs)

        docs = self._extract_documents(self._captured)
        log.info("rdf.search.done", krs=krs, documents=len(docs))
        return docs

    def download(self, doc: RdfDocument) -> bytes:
        """Download a document's raw bytes using the browser session cookies."""
        if self._page is None:
            raise RdfScrapeError("Scraper not started; use as a context manager.")
        url = f"{RDF_BASE_URL}{DOWNLOAD_PATH_TEMPLATE.format(doc_id=doc.document_id)}"
        log.info("rdf.download", document_id=doc.document_id)
        # Use the page's request context so BigIP/session cookies are sent.
        resp = self._page.request.get(url)
        if not resp.ok:
            raise RdfScrapeError(f"Download failed [{resp.status}] for {doc.document_id}")
        data = resp.body()
        doc.content = data
        if doc.original_format is None:
            doc.original_format = "xml" if data[:64].lstrip().startswith(b"<") else "pdf"
        return data

    # ── parsing of captured JSON ────────────────────────────────────────────

    @staticmethod
    def _extract_documents(captured: list[dict]) -> list[RdfDocument]:
        """Normalize the SPA's JSON into RdfDocument records.

        The exact JSON shape varies; we walk it defensively, looking for objects
        that carry a document id and a title/kind. Kept lenient so a minor schema
        change degrades gracefully rather than crashing the pipeline.
        """
        docs: dict[str, RdfDocument] = {}

        def walk(node: object) -> None:
            if isinstance(node, dict):
                doc_id = (
                    node.get("idDokumentu")
                    or node.get("id")
                    or node.get("documentId")
                )
                title = node.get("nazwa") or node.get("tytul") or node.get("title")
                kind = node.get("rodzaj") or node.get("typDokumentu") or node.get("kind")
                if doc_id and (title or kind):
                    docs[str(doc_id)] = RdfDocument(
                        document_id=str(doc_id),
                        title=str(title or kind),
                        document_kind=str(kind) if kind else None,
                        fiscal_year=_year_from(node),
                        period_start=_parse_pl_date(
                            node.get("dataOd") or node.get("okresOd")
                        ),
                        period_end=_parse_pl_date(
                            node.get("dataDo") or node.get("okresDo")
                        ),
                        filed_date=_parse_pl_date(
                            node.get("dataZlozenia") or node.get("dataWplywu")
                        ),
                        raw_meta=node,
                    )
                for v in node.values():
                    walk(v)
            elif isinstance(node, list):
                for v in node:
                    walk(v)

        for entry in captured:
            walk(entry.get("json"))

        return sorted(
            docs.values(),
            key=lambda d: (d.fiscal_year or 0, d.title),
            reverse=True,
        )


def _year_from(node: dict) -> int | None:
    for key in ("rok", "rokObrotowy", "fiscalYear", "year"):
        v = node.get(key)
        if v:
            try:
                return int(str(v)[:4])
            except (ValueError, TypeError):
                pass
    end = _parse_pl_date(node.get("dataDo") or node.get("okresDo"))
    return end.year if end else None
