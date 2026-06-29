from pathlib import Path

from app.parse.financial_parser import (
    BALANCE_SHEET,
    PROFIT_LOSS,
    parse_esprawozdanie,
)

FIXTURE = Path(__file__).parent / "fixtures" / "esprawozdanie_sample.xml"


def _parse():
    return parse_esprawozdanie(FIXTURE.read_bytes())


def test_period_and_year():
    fin = _parse()
    assert fin.fiscal_year == 2022
    assert fin.period_start is not None and fin.period_start.year == 2022
    assert fin.period_end is not None and fin.period_end.month == 12


def test_headline_figures():
    fin = _parse()
    assert fin.revenue == 950000000.00
    assert fin.operating_profit == 320000000.00
    assert fin.net_profit == 280000000.00
    assert fin.total_assets == 1200000000.00
    assert fin.total_equity == 900000000.00
    assert fin.total_liabilities == 300000000.00
    assert fin.cash == 350000000.00


def test_line_items_extracted():
    fin = _parse()
    balance = [li for li in fin.line_items if li.statement == BALANCE_SHEET]
    pnl = [li for li in fin.line_items if li.statement == PROFIT_LOSS]
    assert len(balance) >= 7  # assets + sub-items + pasywa
    assert len(pnl) == 3


def test_comparative_values():
    fin = _parse()
    revenue = next(li for li in fin.line_items if "Przychody netto" in li.label)
    assert revenue.value == 950000000.00
    assert revenue.prev_value == 880000000.00


def test_nesting_depth():
    fin = _parse()
    # 'Wartości niematerialne' is nested under 'Aktywa trwałe' -> depth 1
    wnip = next(li for li in fin.line_items if "Wartości niematerialne" in li.label)
    assert wnip.depth == 1


def test_section_tagging():
    fin = _parse()
    assets = next(li for li in fin.line_items if li.label == "Aktywa razem")
    assert assets.section == "assets"
