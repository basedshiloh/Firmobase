from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import (
    Date,
    DateTime,
    ForeignKey,
    Numeric,
    Real,
    SmallInteger,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class Grant(Base):
    __tablename__ = "grants"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        server_default=func.gen_random_uuid(),
    )
    program: Mapped[str] = mapped_column(Text, nullable=False)
    program_year: Mapped[int | None] = mapped_column(SmallInteger)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    beneficiary_name: Mapped[str | None] = mapped_column(Text)
    amount_pln: Mapped[float | None] = mapped_column(Numeric(18, 2))
    amount_eu: Mapped[float | None] = mapped_column(Numeric(18, 2))
    start_date: Mapped[date | None] = mapped_column(Date)
    end_date: Mapped[date | None] = mapped_column(Date)
    status: Mapped[str | None] = mapped_column(Text)
    voivodeship: Mapped[str | None] = mapped_column(Text)
    source_url: Mapped[str | None] = mapped_column(Text)
    source_id: Mapped[str | None] = mapped_column(
        Text, unique=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class CompanyGrant(Base):
    __tablename__ = "company_grants"
    __table_args__ = (
        UniqueConstraint("company_id", "grant_id"),
    )

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        server_default=func.gen_random_uuid(),
    )
    company_id: Mapped[str] = mapped_column(
        ForeignKey("companies.id", ondelete="CASCADE"),
        index=True,
    )
    grant_id: Mapped[str] = mapped_column(
        ForeignKey("grants.id", ondelete="CASCADE"),
        index=True,
    )
    match_method: Mapped[str] = mapped_column(
        Text, nullable=False, default="nip"
    )
    match_score: Mapped[float | None] = mapped_column(Real)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
