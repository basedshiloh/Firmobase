"""HTTP client for the Polish Ministry of Justice KRS API.

Docs: https://api-krs.ms.gov.pl/  (Otwarte dane KRS)

Endpoints used:
    GET /api/krs/OdpisAktualny/{krs}?rejestr={P|S}&format=json
    GET /api/krs/OdpisPelny/{krs}?rejestr={P|S}&format=json

The API is unauthenticated but rate-limited by the ministry. We add a simple
client-side throttle plus retry-with-backoff on transient failures so a batch
run stays well-behaved.
"""

from __future__ import annotations

import threading
import time
from enum import StrEnum

import httpx
import structlog
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from app.config import get_settings

log = structlog.get_logger(__name__)


class Registry(StrEnum):
    """eKRS register. P = przedsiębiorców (entrepreneurs), S = stowarzyszeń."""

    entrepreneurs = "P"
    associations = "S"


class EkrsApiError(RuntimeError):
    """Non-recoverable error talking to the eKRS API."""


class EkrsNotFound(EkrsApiError):
    """The KRS number does not exist in the requested register."""


class _RateLimiter:
    """Process-wide minimum spacing between requests (thread-safe)."""

    def __init__(self, per_minute: int) -> None:
        self._min_interval = 60.0 / per_minute if per_minute > 0 else 0.0
        self._lock = threading.Lock()
        self._next_allowed = 0.0

    def acquire(self) -> None:
        if self._min_interval <= 0:
            return
        with self._lock:
            now = time.monotonic()
            wait = self._next_allowed - now
            if wait > 0:
                time.sleep(wait)
                now = time.monotonic()
            self._next_allowed = now + self._min_interval


class EkrsClient:
    """Fetches odpis (extract) payloads for a KRS number.

    Usage:
        with EkrsClient() as client:
            payload = client.fetch_current("0000006865")
    """

    def __init__(
        self,
        base_url: str | None = None,
        rate_limit_per_min: int | None = None,
        timeout: float = 30.0,
    ) -> None:
        settings = get_settings()
        self._base_url = (base_url or settings.ekrs_api_base).rstrip("/")
        self._limiter = _RateLimiter(
            rate_limit_per_min
            if rate_limit_per_min is not None
            else settings.ekrs_rate_limit_per_min
        )
        self._client = httpx.Client(
            base_url=self._base_url,
            timeout=timeout,
            headers={"Accept": "application/json"},
        )

    def __enter__(self) -> EkrsClient:
        return self

    def __exit__(self, *_exc: object) -> None:
        self.close()

    def close(self) -> None:
        self._client.close()

    def fetch_current(
        self, krs: str, registry: Registry = Registry.entrepreneurs
    ) -> dict:
        """Current extract (odpis aktualny) — present-state snapshot."""
        return self._get(f"/api/krs/OdpisAktualny/{krs}", registry)

    def fetch_full(
        self, krs: str, registry: Registry = Registry.entrepreneurs
    ) -> dict:
        """Full extract (odpis pełny) — includes historical entries."""
        return self._get(f"/api/krs/OdpisPelny/{krs}", registry)

    @retry(
        retry=retry_if_exception_type(httpx.TransportError),
        stop=stop_after_attempt(4),
        wait=wait_exponential(multiplier=1, min=1, max=20),
        reraise=True,
    )
    def _get(self, path: str, registry: Registry) -> dict:
        self._limiter.acquire()
        log.debug("ekrs.request", path=path, registry=registry.value)
        resp = self._client.get(path, params={"rejestr": registry.value, "format": "json"})

        if resp.status_code == 404:
            raise EkrsNotFound(f"KRS not found in register {registry.value}: {path}")
        if resp.status_code == 429:
            # Honor server throttle then let tenacity retry via TransportError-like path.
            retry_after = float(resp.headers.get("Retry-After", "5"))
            log.warning("ekrs.throttled", retry_after=retry_after, path=path)
            time.sleep(retry_after)
            raise httpx.TransportError("429 throttled")
        if resp.status_code >= 500:
            raise httpx.TransportError(f"eKRS server error {resp.status_code}")
        if resp.status_code != 200:
            raise EkrsApiError(f"eKRS returned {resp.status_code} for {path}: {resp.text[:200]}")

        try:
            return resp.json()
        except ValueError as exc:  # malformed body
            raise EkrsApiError(f"eKRS returned non-JSON body for {path}") from exc
