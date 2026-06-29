from __future__ import annotations

import enum
from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class StatementKind(str, enum.Enum):
    balance_sheet = "balance_sheet"
    profit_loss = "profit_loss"
    cash_flow = "cash_flow"
    equity_changes = "equity_changes"
    notes = "notes"


class FinancialReport(Base):
    __tablename__ = "financial_reports"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, server_default=func.gen_random_uuid()
    )
    company_id: Mapped[str] = mapped_column(
        ForeignKey("companies.id", ondelete="CASCADE"), index=True
    )
    fiscal_year: Mapped[int] = mapped_column(Integer, nullable=False)
    period_start: Mapped[date | None] = mapped_column(Date)
    period_end: Mapped[date | None] = mapped_column(Date)
    consolidated: Mapped[bool] = mapped_column(Boolean, default=False)
    currency: Mapped[str | None] = mapped_column(Text, default="PLN")

    source: Mapped[str | None] = mapped_column(Text, default="ekrs_rdf")
    source_document_id: Mapped[str | None] = mapped_column(Text)
    original_format: Mapped[str | None] = mapped_column(Text)
    storage_path: Mapped[str | None] = mapped_column(Text)
    content_hash: Mapped[str | None] = mapped_column(Text)
    filed_date: Mapped[date | None] = mapped_column(Date)
    parsed: Mapped[bool] = mapped_column(Boolean, default=False)
    parse_error: Mapped[str | None] = mapped_column(Text)

    revenue: Mapped[float | None] = mapped_column(Numeric(20, 2))
    operating_profit: Mapped[float | None] = mapped_column(Numeric(20, 2))
    net_profit: Mapped[float | None] = mapped_column(Numeric(20, 2))
    total_assets: Mapped[float | None] = mapped_column(Numeric(20, 2))
    total_equity: Mapped[float | None] = mapped_column(Numeric(20, 2))
    total_liabilities: Mapped[float | None] = mapped_column(Numeric(20, 2))
    cash: Mapped[float | None] = mapped_column(Numeric(20, 2))

    raw: Mapped[dict | None] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    line_items: Mapped[list[FinancialLineItem]] = relationship(
        back_populates="report", cascade="all, delete-orphan"
    )


class FinancialLineItem(Base):
    __tablename__ = "financial_line_items"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, server_default=func.gen_random_uuid()
    )
    report_id: Mapped[str] = mapped_column(
        ForeignKey("financial_reports.id", ondelete="CASCADE"), index=True
    )
    statement: Mapped[StatementKind] = mapped_column(String, nullable=False)
    section: Mapped[str | None] = mapped_column(Text)
    code: Mapped[str | None] = mapped_column(Text)
    label: Mapped[str] = mapped_column(Text, nullable=False)
    label_en: Mapped[str | None] = mapped_column(Text)
    value: Mapped[float | None] = mapped_column(Numeric(20, 2))
    prev_value: Mapped[float | None] = mapped_column(Numeric(20, 2))
    ordinal: Mapped[int | None] = mapped_column(Integer)
    depth: Mapped[int | None] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    report: Mapped[FinancialReport] = relationship(back_populates="line_items")
