"""Upload original financial documents to Supabase Storage.

Originals (XML/PDF) are kept verbatim so we can re-parse without re-scraping and
so users can download the source filing. Uploads use the service-role key and go
to a private bucket; the pipeline records the returned object path on the report.
"""

from __future__ import annotations

import httpx
import structlog

from app.config import get_settings

log = structlog.get_logger(__name__)

BUCKET = "financial-documents"


def upload_original(
    object_path: str,
    data: bytes,
    content_type: str = "application/octet-stream",
) -> str | None:
    """Upload bytes to Supabase Storage; return the stored object path or None.

    Best-effort: storage failures are logged and swallowed so a parse+persist
    still succeeds even if the original upload hiccups (it can be retried).
    """
    settings = get_settings()
    if not settings.supabase_url or not settings.supabase_service_role_key:
        log.warning("storage.skip", reason="supabase credentials not configured")
        return None

    url = f"{settings.supabase_url}/storage/v1/object/{BUCKET}/{object_path}"
    headers = {
        "Authorization": f"Bearer {settings.supabase_service_role_key}",
        "apikey": settings.supabase_service_role_key,
        "Content-Type": content_type,
        "x-upsert": "true",
    }
    try:
        resp = httpx.post(url, headers=headers, content=data, timeout=60.0)
        if resp.status_code in (200, 201):
            log.info("storage.upload.ok", path=object_path, bytes=len(data))
            return f"{BUCKET}/{object_path}"
        log.warning("storage.upload.failed", status=resp.status_code, body=resp.text[:200])
        return None
    except httpx.HTTPError as exc:
        log.warning("storage.upload.error", error=repr(exc))
        return None
