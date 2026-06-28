from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.ingest import router as ingest_router
from app.config import get_settings

settings = get_settings()

app = FastAPI(
    title="Firmobase Pipeline API",
    version="0.0.1",
    description="Ingestion, scraping, parsing and analytics service.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten to the web origin before production
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(ingest_router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "firmobase-pipeline", "env": settings.environment}


@app.get("/")
def root() -> dict[str, str]:
    return {"message": "Firmobase pipeline. See /docs for the OpenAPI spec."}
