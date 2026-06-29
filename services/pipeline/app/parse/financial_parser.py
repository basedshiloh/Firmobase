"""Parser for Polish e-sprawozdania finansowe (structured XML).

Since 2018, financial statements filed electronically with the eKRS are
structured XML conforming to the Ministry of Finance schemas
(``http://www.mf.gov.pl/schematy/SF/...``). Each statement contains, for the
common "jednostka inna" (other entity) variant:

    Bilans                     — balance sheet (Aktywa / Pasywa)
    RachunekZyskówIStrat       — profit & loss (wariant porównawczy/kalkulacyjny)
    RachunekPrzepływówPieniężnych — cash flow (optional)
    ZestawienieZmianWKapitale  — changes in equity (optional)

Every position carries the current-period value and a prior-period comparative.
This parser is namespace-agnostic (matches on local tag names) so it tolerates
the several schema versions in circulation, and it extracts *every* leaf value it
finds — fulfilling "extract every available financial field" — while also
surfacing denormalized headline figures (revenue, net profit, totals).

Older statements are scanned PDFs with no structured data; those are stored as
originals only and flagged ``parsed = false`` upstream (PDF table extraction is a
later enhancement).
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date
from xml.etree import ElementTree as ET

# Statement kinds (mirror app.models.financials.StatementKind values).
BALANCE_SHEET = "balance_sheet"
PROFIT_LOSS = "profit_loss"
CASH_FLOW = "cash_flow"
EQUITY_CHANGES = "equity_changes"

# Local tag names (without namespace) that introduce each statement block.
_STATEMENT_TAGS = {
    "Bilans": BALANCE_SHEET,
    "RachunekZyskowIStrat": PROFIT_LOSS,
    "RachunekZyskÓwIStrat": PROFIT_LOSS,
    "RachunekPrzeplywowPienieznych": CASH_FLOW,
    "RachunekPrzepływówPieniężnych": CASH_FLOW,
    "ZestawienieZmianWKapitale": EQUITY_CHANGES,
    "ZestawienieZmianWKapitaleWlasnym": EQUITY_CHANGES,
}

# Tags carrying a current-period value within a position.
_VALUE_TAGS = {"KwotaA", "KwotaNaDzienKonczacy", "Kwota", "WartoscNaDzienKonczacy"}
# Tags carrying the prior-period comparative.
_PREV_TAGS = {"KwotaB", "KwotaNaDzienPoczatkowy", "KwotaPoprzednia", "WartoscNaDzienPoczatkowy"}


@dataclass
class ParsedLineItem:
    statement: str
    label: str
    value: float | None
    prev_value: float | None = None
    code: str | None = None
    section: str | None = None
    depth: int = 0
    ordinal: int = 0


@dataclass
class ParsedFinancials:
    fiscal_year: int | None = None
    period_start: date | None = None
    period_end: date | None = None
    currency: str = "PLN"
    line_items: list[ParsedLineItem] = field(default_factory=list)
    # headline figures
    revenue: float | None = None
    operating_profit: float | None = None
    net_profit: float | None = None
    total_assets: float | None = None
    total_equity: float | None = None
    total_liabilities: float | None = None
    cash: float | None = None


def _local(tag: str) -> str:
    """Strip XML namespace: '{ns}Bilans' -> 'Bilans'."""
    return tag.rsplit("}", 1)[-1]


def _to_float(text: str | None) -> float | None:
    if not text:
        return None
    s = text.strip().replace("\xa0", "").replace(" ", "")
    if not s:
        return None
    # Polish decimals may use a comma; values are usually plain integers/decimals.
    s = s.replace(",", ".")
    # keep leading minus, digits and one dot
    if not re.match(r"^-?\d+(\.\d+)?$", s):
        return None
    try:
        return float(s)
    except ValueError:
        return None


def _parse_date(text: str | None) -> date | None:
    if not text:
        return None
    m = re.match(r"(\d{4})-(\d{2})-(\d{2})", text.strip())
    if m:
        try:
            return date(int(m[1]), int(m[2]), int(m[3]))
        except ValueError:
            return None
    return None


def parse_esprawozdanie(xml_bytes: bytes | str) -> ParsedFinancials:
    """Parse a structured e-sprawozdanie XML into normalized financials."""
    root = ET.fromstring(xml_bytes if isinstance(xml_bytes, bytes) else xml_bytes.encode())
    result = ParsedFinancials()

    _extract_period(root, result)

    ordinal = 0
    for elem in root.iter():
        kind = _STATEMENT_TAGS.get(_local(elem.tag))
        if kind:
            for item in _walk_positions(elem, kind, depth=0):
                item.ordinal = ordinal
                ordinal += 1
                result.line_items.append(item)

    _derive_headline(result)
    return result


def _extract_period(root: ET.Element, result: ParsedFinancials) -> None:
    for elem in root.iter():
        name = _local(elem.tag)
        if name in {"DataOd", "OkresOd", "DzienBilansowyOd"} and result.period_start is None:
            result.period_start = _parse_date(elem.text)
        elif name in {"DataDo", "OkresDo", "DzienBilansowy"} and result.period_end is None:
            result.period_end = _parse_date(elem.text)
    if result.period_end:
        result.fiscal_year = result.period_end.year
    elif result.period_start:
        result.fiscal_year = result.period_start.year


def _walk_positions(
    block: ET.Element, statement: str, depth: int
) -> list[ParsedLineItem]:
    """Recurse a statement block, emitting a line item per labelled position.

    A "position" is any element that has a human label (``OpisPozycji`` / a
    ``nazwa``-like child or attribute) and/or a numeric value child. We keep
    nesting depth for indentation in the UI.
    """
    items: list[ParsedLineItem] = []

    for child in block:
        local = _local(child.tag)
        if local in {"DataOd", "DataDo", "OkresOd", "OkresDo"}:
            continue

        label = _label_of(child)
        value = _value_of(child, _VALUE_TAGS)
        prev = _value_of(child, _PREV_TAGS)
        code = child.attrib.get("idP") or child.attrib.get("pozycja") or _code_of(child)

        has_data = label is not None or value is not None
        if has_data and label:
            items.append(
                ParsedLineItem(
                    statement=statement,
                    label=label,
                    value=value,
                    prev_value=prev,
                    code=code,
                    section=_section_for(statement, label),
                    depth=depth,
                )
            )
            # recurse one level deeper for nested sub-positions
            items.extend(_walk_positions(child, statement, depth + 1))
        else:
            # structural wrapper without its own label — recurse at same depth
            items.extend(_walk_positions(child, statement, depth))

    return items


def _label_of(elem: ET.Element) -> str | None:
    for child in elem:
        if _local(child.tag) in {"OpisPozycji", "Nazwa", "NazwaPozycji", "Opis"}:
            if child.text and child.text.strip():
                return child.text.strip()
    return None


def _value_of(elem: ET.Element, tags: set[str]) -> float | None:
    for child in elem:
        if _local(child.tag) in tags:
            v = _to_float(child.text)
            if v is not None:
                return v
    return None


def _code_of(elem: ET.Element) -> str | None:
    for child in elem:
        if _local(child.tag) in {"KodPozycji", "Pozycja", "Symbol"}:
            if child.text and child.text.strip():
                return child.text.strip()
    return None


def _section_for(statement: str, label: str) -> str | None:
    low = label.lower()
    if statement == BALANCE_SHEET:
        if "aktyw" in low:
            return "assets"
        if "pasyw" in low or "kapitał" in low or "zobowiąz" in low:
            return "equity_liabilities"
    return None


# Patterns to identify headline figures from Polish labels.
_HEADLINE_PATTERNS: list[tuple[str, str]] = [
    ("revenue", r"przychody netto ze sprzedaż"),
    ("operating_profit", r"zysk \(strata\) z działalności operacyjnej"),
    ("net_profit", r"zysk \(strata\) netto"),
    ("total_assets", r"^aktywa razem|^suma aktywów"),
    ("total_equity", r"kapitał \(fundusz\) własny"),
    ("total_liabilities", r"zobowiązania i rezerwy na zobowiązania"),
    ("cash", r"środki pieniężne i inne aktywa pieniężne"),
]


def _derive_headline(result: ParsedFinancials) -> None:
    for item in result.line_items:
        if item.value is None:
            continue
        low = item.label.lower()
        for attr, pattern in _HEADLINE_PATTERNS:
            if getattr(result, attr) is None and re.search(pattern, low):
                setattr(result, attr, item.value)
