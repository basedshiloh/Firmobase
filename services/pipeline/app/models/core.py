from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import (
    BigInteger,
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
from app.models.enums import PersonType, RoleCategory

__all__ = [
    "Company",
    "CompanyAddress",
    "CompanyPkd",
    "CompanyRole",
    "IngestionRun",
    "Person",
    "PersonType",
    "PkdCode",
    "RoleCategory",
]


class Company(Base):
    __tablename__ = "companies"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, server_default=func.gen_random_uuid()
    )
    krs: Mapped[str | None] = mapped_column(Text, unique=True)
    nip: Mapped[str | None] = mapped_column(Text, index=True)
    regon: Mapped[str | None] = mapped_column(Text, index=True)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    legal_form: Mapped[str | None] = mapped_column(Text)
    legal_form_code: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str | None] = mapped_column(Text)
    ekrs_section: Mapped[str | None] = mapped_column(Text)
    registry_court: Mapped[str | None] = mapped_column(Text)
    registration_date: Mapped[date | None] = mapped_column(Date)
    share_capital: Mapped[float | None] = mapped_column(Numeric(18, 2))
    share_capital_currency: Mapped[str | None] = mapped_column(Text, default="PLN")
    website: Mapped[str | None] = mapped_column(Text)
    email: Mapped[str | None] = mapped_column(Text)
    phone: Mapped[str | None] = mapped_column(Text)
    source: Mapped[str | None] = mapped_column(Text)
    last_ingested_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    raw: Mapped[dict | None] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    addresses: Mapped[list[CompanyAddress]] = relationship(
        back_populates="company", cascade="all, delete-orphan"
    )
    roles: Mapped[list[CompanyRole]] = relationship(
        back_populates="company", cascade="all, delete-orphan"
    )
    pkd: Mapped[list[CompanyPkd]] = relationship(
        back_populates="company", cascade="all, delete-orphan"
    )


class CompanyAddress(Base):
    __tablename__ = "company_addresses"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, server_default=func.gen_random_uuid()
    )
    company_id: Mapped[str] = mapped_column(
        ForeignKey("companies.id", ondelete="CASCADE"), index=True
    )
    address_type: Mapped[str | None] = mapped_column(Text, default="registered")
    street: Mapped[str | None] = mapped_column(Text)
    building_no: Mapped[str | None] = mapped_column(Text)
    apartment_no: Mapped[str | None] = mapped_column(Text)
    postal_code: Mapped[str | None] = mapped_column(Text)
    city: Mapped[str | None] = mapped_column(Text)
    commune: Mapped[str | None] = mapped_column(Text)
    district: Mapped[str | None] = mapped_column(Text)
    voivodeship: Mapped[str | None] = mapped_column(Text)
    country: Mapped[str | None] = mapped_column(Text, default="PL")
    valid_from: Mapped[date | None] = mapped_column(Date)
    valid_to: Mapped[date | None] = mapped_column(Date)
    raw: Mapped[dict | None] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    company: Mapped[Company] = relationship(back_populates="addresses")


class Person(Base):
    __tablename__ = "persons"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, server_default=func.gen_random_uuid()
    )
    person_type: Mapped[PersonType] = mapped_column(String, nullable=False)
    full_name: Mapped[str] = mapped_column(Text, nullable=False)
    first_name: Mapped[str | None] = mapped_column(Text)
    last_name: Mapped[str | None] = mapped_column(Text)
    linked_company_id: Mapped[str | None] = mapped_column(
        ForeignKey("companies.id", ondelete="SET NULL")
    )
    normalized_name: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    roles: Mapped[list[CompanyRole]] = relationship(
        back_populates="person", cascade="all, delete-orphan"
    )


class CompanyRole(Base):
    __tablename__ = "company_roles"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, server_default=func.gen_random_uuid()
    )
    company_id: Mapped[str] = mapped_column(
        ForeignKey("companies.id", ondelete="CASCADE"), index=True
    )
    person_id: Mapped[str] = mapped_column(ForeignKey("persons.id", ondelete="CASCADE"), index=True)
    role_category: Mapped[RoleCategory] = mapped_column(String, nullable=False)
    position: Mapped[str | None] = mapped_column(Text)
    shareholding_pct: Mapped[float | None] = mapped_column(Numeric(7, 4))
    shares_count: Mapped[int | None] = mapped_column(BigInteger)
    shares_value: Mapped[float | None] = mapped_column(Numeric(18, 2))
    appointed_at: Mapped[date | None] = mapped_column(Date)
    ended_at: Mapped[date | None] = mapped_column(Date)
    is_current: Mapped[bool] = mapped_column(Boolean, default=True)
    raw: Mapped[dict | None] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    company: Mapped[Company] = relationship(back_populates="roles")
    person: Mapped[Person] = relationship(back_populates="roles")


class PkdCode(Base):
    __tablename__ = "pkd_codes"

    code: Mapped[str] = mapped_column(Text, primary_key=True)
    description: Mapped[str | None] = mapped_column(Text)
    section: Mapped[str | None] = mapped_column(Text)


class CompanyPkd(Base):
    __tablename__ = "company_pkd"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, server_default=func.gen_random_uuid()
    )
    company_id: Mapped[str] = mapped_column(
        ForeignKey("companies.id", ondelete="CASCADE"), index=True
    )
    pkd_code: Mapped[str] = mapped_column(ForeignKey("pkd_codes.code"), index=True)
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False)

    company: Mapped[Company] = relationship(back_populates="pkd")


class IngestionRun(Base):
    __tablename__ = "ingestion_runs"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, server_default=func.gen_random_uuid()
    )
    source: Mapped[str] = mapped_column(Text, nullable=False)
    target_krs: Mapped[str | None] = mapped_column(Text, index=True)
    status: Mapped[str] = mapped_column(Text, default="pending")
    records_processed: Mapped[int | None] = mapped_column(Integer, default=0)
    error: Mapped[str | None] = mapped_column(Text)
    meta: Mapped[dict | None] = mapped_column(JSONB)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
