"""eKRS financial-document scraping (RDF — Repozytorium Dokumentów Finansowych)."""

from app.scrape.rdf_scraper import RdfDocument, RdfScraper, RdfScrapeError

__all__ = ["RdfDocument", "RdfScraper", "RdfScrapeError"]
