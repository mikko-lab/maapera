"""Tests for risk_class and trend_class classifiers."""

from __future__ import annotations

import numpy as np
import pytest

from src.classify import risk_class, trend_class


class TestRiskClass:
    @pytest.mark.parametrize(
        ("velocity", "expected"),
        [
            (0.0, "stable"),
            (1.99, "stable"),
            (2.0, "monitor"),
            (4.99, "monitor"),
            (5.0, "attention"),
            (9.99, "attention"),
            (10.0, "urgent"),
            (50.0, "urgent"),
        ],
    )
    def test_thresholds(self, velocity: float, expected: str) -> None:
        assert risk_class(velocity) == expected


def _monthly_dates(years: float, start: str = "2018-01-15") -> list[str]:
    """Generate ~monthly ISO date strings spanning ``years``."""
    n = int(years * 12) + 1
    start_dt = np.datetime64(start)
    return [
        str(start_dt + np.timedelta64(30 * i, "D"))
        for i in range(n)
    ]


class TestTrendClass:
    def test_stable_random_noise(self) -> None:
        dates = _monthly_dates(5)
        rng = np.random.default_rng(0)
        values = rng.normal(0, 0.5, size=len(dates))
        assert trend_class(dates, values) == "stable"

    def test_linear_steady_subsidence(self) -> None:
        dates = _monthly_dates(5)
        x = np.arange(len(dates)) / 12
        rng = np.random.default_rng(1)
        values = -4.0 * x + rng.normal(0, 0.3, size=len(dates))
        assert trend_class(dates, values) == "linear"

    def test_accelerating_subsidence(self) -> None:
        # Early slope ≈ -1 mm/y, late slope ≈ -6 mm/y.
        dates = _monthly_dates(5)
        x = np.arange(len(dates)) / 12
        rng = np.random.default_rng(2)
        values = np.where(x < 3, -1.0 * x, -3.0 - 6.0 * (x - 3))
        values = values + rng.normal(0, 0.2, size=len(dates))
        assert trend_class(dates, values) == "accelerating"

    def test_decelerating_subsidence(self) -> None:
        # Early slope ≈ -6 mm/y, late slope ≈ -1 mm/y.
        dates = _monthly_dates(5)
        x = np.arange(len(dates)) / 12
        rng = np.random.default_rng(3)
        values = np.where(x < 3, -6.0 * x, -18.0 - 1.0 * (x - 3))
        values = values + rng.normal(0, 0.2, size=len(dates))
        assert trend_class(dates, values) == "decelerating"

    def test_seasonal_annual_cycle(self) -> None:
        # Near-zero trend with a strong 1-year sinusoid; the seasonality
        # detector must beat the stable-slope short-circuit.
        dates = _monthly_dates(5)
        x = np.arange(len(dates)) / 12
        rng = np.random.default_rng(4)
        values = 3.0 * np.sin(2 * np.pi * x) + rng.normal(0, 0.2, size=len(dates))
        assert trend_class(dates, values) == "seasonal"

    def test_short_series_returns_stable(self) -> None:
        # Fewer than TREND_MIN_OBSERVATIONS samples: refuse to classify.
        dates = _monthly_dates(0.3)  # ~4 months
        values = np.arange(len(dates), dtype=float)
        assert trend_class(dates, values) == "stable"

    def test_positive_uplift_classified_linear(self) -> None:
        # +3 mm/y constant uplift should not be confused with seasonality.
        dates = _monthly_dates(4)
        x = np.arange(len(dates)) / 12
        rng = np.random.default_rng(5)
        values = 3.0 * x + rng.normal(0, 0.3, size=len(dates))
        assert trend_class(dates, values) == "linear"
