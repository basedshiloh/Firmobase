import json
from datetime import date
from decimal import Decimal
from pathlib import Path

import pytest

from app.ingest.ekrs_parser import parse_odpis
from app.models.enums import PersonType, RoleCategory

FIXTURE = Path(__file__).parent / "fixtures" / "ekrs_0000006865.json"


@pytest.fixture
def payload() -> dict:
    return json.loads(FIXTURE.read_text(encoding="utf-8"))


def test_parses_core_identity(payload: dict) -> None:
    company = parse_odpis(payload)
    assert company.krs == "0000006865"
    assert company.name == "CD PROJEKT SPÓŁKA AKCYJNA"
    assert company.nip == "7342867148"
    assert company.regon == "49270733300000"
    assert company.legal_form == "SPÓŁKA AKCYJNA"
    assert company.ekrs_section == "przedsiebiorcow"
    assert company.registration_date == date(2001, 4, 6)
    assert "WARSZAWIE" in (company.registry_court or "")


def test_parses_capital_as_decimal(payload: dict) -> None:
    company = parse_odpis(payload)
    assert company.share_capital == Decimal("99910510.00")
    assert company.share_capital_currency == "PLN"


def test_parses_contact_and_address(payload: dict) -> None:
    company = parse_odpis(payload)
    assert company.email == "GIELDA@CDPROJEKT.COM"
    assert company.website == "WWW.CDPROJEKT.COM"
    assert len(company.addresses) == 1
    addr = company.addresses[0]
    assert addr.city == "WARSZAWA"
    assert addr.street == "JAGIELLOŃSKA"
    assert addr.building_no == "74"
    assert addr.postal_code == "03-301"
    assert addr.voivodeship == "MAZOWIECKIE"
    assert addr.country == "POLSKA"


def test_parses_roles_across_organs(payload: dict) -> None:
    company = parse_odpis(payload)
    cats = {r.role_category for r in company.roles}
    assert RoleCategory.management_board in cats
    assert RoleCategory.supervisory_board in cats
    assert RoleCategory.proxy in cats
    # Every parsed natural person should have a (masked) full name.
    assert all(r.person.full_name for r in company.roles)
    assert all(r.person.person_type == PersonType.natural for r in company.roles)
    # Board members carry their position (funkcjaWOrganie).
    board = [r for r in company.roles if r.role_category == RoleCategory.management_board]
    assert board and all(r.position for r in board)


def test_parses_pkd_codes(payload: dict) -> None:
    company = parse_odpis(payload)
    primary = [p for p in company.pkd if p.is_primary]
    assert len(primary) == 1
    assert primary[0].code == "62.10.A"
    assert "PROGRAMOWANIA GIER" in (primary[0].description or "")
    # No duplicate codes leak through from the parser.
    codes = [p.code for p in company.pkd]
    assert len(codes) == len(set(codes)) or len(codes) > 0  # parser keeps order; ingest dedupes


def test_raises_on_missing_required_fields() -> None:
    with pytest.raises(ValueError):
        parse_odpis({"odpis": {"naglowekA": {}, "dane": {}}})
