from celery import Celery

from app.config import get_settings

settings = get_settings()

celery_app = Celery(
    "firmobase",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=["app.tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="Europe/Warsaw",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
)

# Scheduled jobs (Celery Beat). Filled in per phase.
celery_app.conf.beat_schedule = {
    # "ingest-ekrs-daily": {
    #     "task": "app.tasks.ingest_ekrs_batch",
    #     "schedule": crontab(hour=3, minute=0),
    # },
}
