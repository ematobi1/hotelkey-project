import pytest

from src.services.guardrails import RateGuardrails


def test_floor_rate_enforced():
    rate, violations = RateGuardrails.apply(50.0, 100.0, floor_rate=80.0, ceiling_rate=500.0)
    assert rate == 80.0
    assert any('floor_rate' in v for v in violations)


def test_ceiling_rate_enforced():
    rate, violations = RateGuardrails.apply(600.0, 100.0, floor_rate=80.0, ceiling_rate=500.0)
    assert rate == 500.0
    assert any('ceiling_rate' in v for v in violations)


def test_max_daily_delta_capped():
    # proposed=200, current=100, max_delta_pct=0.25 → max allowed = 100 + 25 = 125
    rate, violations = RateGuardrails.apply(200.0, 100.0, floor_rate=80.0, ceiling_rate=500.0, max_daily_delta_pct=0.25)
    assert rate == 125.0
    assert any('max_daily_delta' in v for v in violations)


def test_max_daily_delta_decrease_capped():
    # proposed=50, current=100, floor=80, max_delta_pct=0.25
    # floor kicks in first (50 < 80 → rate becomes 80)
    # then delta check: |80 - 100| = 20 <= 25, so no delta violation
    rate, violations = RateGuardrails.apply(50.0, 100.0, floor_rate=80.0, ceiling_rate=500.0, max_daily_delta_pct=0.25)
    assert rate == 80.0
    assert any('floor_rate' in v for v in violations)


def test_max_daily_delta_decrease_no_floor():
    # proposed=60, current=100, floor=40, max_delta_pct=0.25 → max decrease = 100 - 25 = 75
    rate, violations = RateGuardrails.apply(60.0, 100.0, floor_rate=40.0, ceiling_rate=500.0, max_daily_delta_pct=0.25)
    assert rate == 75.0
    assert any('max_daily_delta' in v for v in violations)


def test_valid_rate_passes_through():
    rate, violations = RateGuardrails.apply(110.0, 100.0, floor_rate=80.0, ceiling_rate=500.0, max_daily_delta_pct=0.25)
    assert rate == 110.0
    assert violations == []


def test_exact_boundary_no_violation():
    # Exactly at ceiling and within delta
    rate, violations = RateGuardrails.apply(500.0, 450.0, floor_rate=80.0, ceiling_rate=500.0, max_daily_delta_pct=0.25)
    # delta = |500 - 450| = 50, max_delta = 450 * 0.25 = 112.5 → OK
    assert rate == 500.0
    assert violations == []
