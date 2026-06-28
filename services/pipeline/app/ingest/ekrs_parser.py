"""Pure transform: eKRS odpis JSON -> normalized dataclasses.

No DB or network here so it is trivially unit-testable. The shape mirrors the
live API (verified against KRS 0000006865). All personal data in the public
`OdpisAktualny` feed arrives masked (e.g. "N**********"); we store whatever is
present and keep the raw payload for reprocessing once richer feeds land.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal, InvalidOperation

from app.models.enums import PersonType, RoleCategory


@dataclass
class ParsedAddress:
    address_type: str = "registered"
    street: str | None = None
    building_no: str | None = None
    apartment_no: str | None = None
    postal_code: str | None = None
    city: str | None = None
    commune: str | None = None
    district: str | None = None
    voivodeship: str | None = None
    country: str | None = "PL"
    raw: dict | None = None


@dataclass
class ParsedPerson:
    person_type: PersonType
    full_name: str
    first_name: str | None = None
    last_name: str | None = None
    normalized_name: str | None = None


@dataclass
class ParsedRole:
    person: ParsedPerson
    role_category: RoleCategory
    position: str | None = None
    raw: dict | None = None


@dataclass
class ParsedPkd:
    code: str
    description: str | None
    section: str | None
    is_primary: bool


@dataclass
class ParsedCompany:
    krs: str
    name: str
    nip: str | None = None
    regon: str | None = None
    legal_form: str | None = None
    status: str | None = None
    ekrs_section: str | None = None
    registry_court: str | None = None
    registration_date: date | None = None
    share_capital: Decimal | None = None
    share_capital_currency: str | None = None
    website: str | None = None
    email: str | None = None
    phone: str | None = None
    addresses: list[ParsedAddress] = field(default_factory=list)
    roles: list[ParsedRole] = field(default_factory=list)
    pkd: list[ParsedPkd] = field(default_factory=list)
    raw: dict | None = None


# ── helpers ──────────────────────────────────────────────────────────────


def _clean(value: object) -> str | None:
    if value is None:
        return None
    s = str(value).strip()
    return s or None


def _parse_date(value: object) -> date | None:
    """eKRS dates are 'DD.MM.YYYY'."""
    s = _clean(value)
    if not s:
        return None
    try:
        day, month, year = (int(p) for p in s.split("."))
        return date(year, month, day)
    except (ValueError, TypeError):
        return None


def _parse_decimal(value: object) -> Decimal | None:
    """eKRS money is a comma-decimal string, e.g. '99910510,00'."""
    s = _clean(value)
    if not s:
        return None
    s = s.replace("\xa0", "").replace(" ", "").replace(",", ".")
    try:
        return Decimal(s)
    except (InvalidOperation, ValueError):
        return None


def _normalize_name(name: str) -> str:
    return " ".join(name.upper().split())


def _person_name(member: dict) -> tuple[str, str | None, str | None]:
    """Build (full_name, first_name, last_name) from a sklad member dict."""
    nazwisko = member.get("nazwisko") or {}
    imiona = member.get("imiona") or {}
    last_parts = [
        _clean(nazwisko.get("nazwiskoICzlon")),
        _clean(nazwisko.get("nazwiskoIICzlon")),
    ]
    first_parts = [_clean(imiona.get("imie")), _clean(imiona.get("imieDrugie"))]
    last_name = "-".join(p for p in last_parts if p) or None
    first_name = " ".join(p for p in first_parts if p) or None
    full_name = " ".join(p for p in (first_name, last_name) if p)
    return full_name, first_name, last_name


def _make_person(member: dict) -> ParsedPerson | None:
    """A natural-person org member (board/supervisory/proxy)."""
    full_name, first_name, last_name = _person_name(member)
    if not full_name:
        # Legal-person member (rare in these organs); fall back to a name field.
        full_name = _clean(member.get("nazwa")) or ""
        if not full_name:
            return None
        return ParsedPerson(
            person_type=PersonType.legal,
            full_name=full_name,
            normalized_name=_normalize_name(full_name),
        )
    return ParsedPerson(
        person_type=PersonType.natural,
        full_name=full_name,
        first_name=first_name,
        last_name=last_name,
        normalized_name=_normalize_name(full_name),
    )


# ── section parsers ──────────────────────────────────────────────────────


def _parse_addresses(dzial1: dict) -> list[ParsedAddress]:
    sia = dzial1.get("siedzibaIAdres") or {}
    siedziba = sia.get("siedziba") or {}
    adres = sia.get("adres") or {}
    if not siedziba and not adres:
        return []
    addr = ParsedAddress(
        street=_clean(adres.get("ulica")),
        building_no=_clean(adres.get("nrDomu")),
        apartment_no=_clean(adres.get("nrLokalu")),
        postal_code=_clean(adres.get("kodPocztowy")),
        city=_clean(adres.get("miejscowosc")) or _clean(siedziba.get("miejscowosc")),
        commune=_clean(siedziba.get("gmina")),
        district=_clean(siedziba.get("powiat")),
        voivodeship=_clean(siedziba.get("wojewodztwo")),
        country=_clean(adres.get("kraj")) or _clean(siedziba.get("kraj")) or "PL",
        raw=sia,
    )
    return [addr]


def _members(organ: object) -> list[dict]:
    """Return the 'sklad' member list from an organ that may be a dict or list."""
    if isinstance(organ, list):
        out: list[dict] = []
        for o in organ:
            if isinstance(o, dict):
                out.extend(m for m in (o.get("sklad") or []) if isinstance(m, dict))
        return out
    if isinstance(organ, dict):
        return [m for m in (organ.get("sklad") or []) if isinstance(m, dict)]
    return []


def _parse_roles(dzial2: dict) -> list[ParsedRole]:
    roles: list[ParsedRole] = []

    for member in _members(dzial2.get("reprezentacja")):
        person = _make_person(member)
        if person:
            roles.append(
                ParsedRole(
                    person=person,
                    role_category=RoleCategory.management_board,
                    position=_clean(member.get("funkcjaWOrganie")),
                    raw=member,
                )
            )

    for member in _members(dzial2.get("organNadzoru")):
        person = _make_person(member)
        if person:
            roles.append(
                ParsedRole(
                    person=person,
                    role_category=RoleCategory.supervisory_board,
                    position=_clean(member.get("funkcjaWOrganie")),
                    raw=member,
                )
            )

    prokurenci = dzial2.get("prokurenci")
    proks = prokurenci if isinstance(prokurenci, list) else _members(prokurenci)
    for member in proks:
        if not isinstance(member, dict):
            continue
        person = _make_person(member)
        if person:
            roles.append(
                ParsedRole(
                    person=person,
                    role_category=RoleCategory.proxy,
                    position=_clean(member.get("rodzajProkury")),
                    raw=member,
                )
            )

    return roles


def _pkd_code(item: dict) -> str | None:
    dzial = _clean(item.get("kodDzial"))
    klasa = _clean(item.get("kodKlasa"))
    podklasa = _clean(item.get("kodPodklasa"))
    if not dzial:
        return None
    parts = [dzial]
    if klasa:
        parts.append(klasa)
    code = ".".join(parts)
    if podklasa:
        code = f"{code}.{podklasa}"
    return code


def _parse_pkd(dzial3: dict) -> list[ParsedPkd]:
    out: list[ParsedPkd] = []
    przedmiot = dzial3.get("przedmiotDzialalnosci") or {}

    def add(items: object, primary: bool) -> None:
        if not isinstance(items, list):
            return
        for item in items:
            if not isinstance(item, dict):
                continue
            code = _pkd_code(item)
            if not code:
                continue
            out.append(
                ParsedPkd(
                    code=code,
                    description=_clean(item.get("opis")),
                    section=_clean(item.get("kodDzial")),
                    is_primary=primary,
                )
            )

    add(przedmiot.get("przedmiotPrzewazajacejDzialalnosci"), primary=True)
    add(przedmiot.get("przedmiotPozostalejDzialalnosci"), primary=False)
    return out


# ── entry point ──────────────────────────────────────────────────────────


def parse_odpis(payload: dict) -> ParsedCompany:
    """Transform a raw OdpisAktualny payload into a ParsedCompany.

    Raises ValueError if the payload is missing the minimum required fields
    (KRS number and name).
    """
    odpis = payload.get("odpis") or {}
    naglowek = odpis.get("naglowekA") or {}
    dane = odpis.get("dane") or {}
    dzial1 = dane.get("dzial1") or {}
    dzial2 = dane.get("dzial2") or {}
    dzial3 = dane.get("dzial3") or {}

    dane_podmiotu = dzial1.get("danePodmiotu") or {}
    identyfikatory = dane_podmiotu.get("identyfikatory") or {}
    sia = dzial1.get("siedzibaIAdres") or {}
    kapital = dzial1.get("kapital") or {}
    kapital_zakladowy = kapital.get("wysokoscKapitaluZakladowego") or {}

    krs = _clean(naglowek.get("numerKRS"))
    name = _clean(dane_podmiotu.get("nazwa"))
    if not krs or not name:
        raise ValueError("payload missing required numerKRS / nazwa")

    rejestr = _clean(naglowek.get("rejestr"))  # e.g. 'RejP'
    ekrs_section = None
    if rejestr:
        ekrs_section = {"RejP": "przedsiebiorcow", "RejS": "stowarzyszen"}.get(
            rejestr, rejestr
        )

    return ParsedCompany(
        krs=krs,
        name=name,
        nip=_clean(identyfikatory.get("nip")),
        regon=_clean(identyfikatory.get("regon")),
        legal_form=_clean(dane_podmiotu.get("formaPrawna")),
        status=_clean(naglowek.get("stanPozycji")),
        ekrs_section=ekrs_section,
        registry_court=_clean(naglowek.get("oznaczenieSaduDokonujacegoOstatniegoWpisu")),
        registration_date=_parse_date(naglowek.get("dataRejestracjiWKRS")),
        share_capital=_parse_decimal(kapital_zakladowy.get("wartosc")),
        share_capital_currency=_clean(kapital_zakladowy.get("waluta")) or "PLN",
        website=_clean(sia.get("adresStronyInternetowej")),
        email=_clean(sia.get("adresPocztyElektronicznej")),
        addresses=_parse_addresses(dzial1),
        roles=_parse_roles(dzial2),
        pkd=_parse_pkd(dzial3),
        raw=payload,
    )
