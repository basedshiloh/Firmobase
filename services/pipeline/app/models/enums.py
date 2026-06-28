"""Domain enums shared by the ORM models and the ingestion parsers.

Kept free of SQLAlchemy so pure (DB-less) code — e.g. parsers — can depend on
them without importing the mapped models.
"""

import enum


class PersonType(enum.StrEnum):
    natural = "natural"
    legal = "legal"


class RoleCategory(enum.StrEnum):
    management_board = "management_board"
    supervisory_board = "supervisory_board"
    proxy = "proxy"
    shareholder = "shareholder"
    partner = "partner"
