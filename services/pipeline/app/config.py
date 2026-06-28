from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Central configuration, loaded from environment / .env."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Database
    database_url: str = "postgresql+psycopg://postgres:postgres@localhost:5432/firmobase"

    # Supabase (service role for server-side writes)
    supabase_url: str = ""
    supabase_service_role_key: str = ""

    # Redis / Celery
    redis_url: str = "redis://localhost:6379/0"

    # eKRS
    ekrs_api_base: str = "https://api-krs.ms.gov.pl"
    ekrs_rate_limit_per_min: int = 30

    # AI
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-opus-4-8"

    environment: str = "development"


@lru_cache
def get_settings() -> Settings:
    return Settings()
