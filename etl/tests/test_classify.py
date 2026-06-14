"""Tests for risk_class, trend_class, compute_winter_gap_residuals,
classify_footprint_hit, and winter_gap_artifact_flag."""

from __future__ import annotations

import numpy as np
import pytest

from src.classify import (
    classify_footprint_hit,
    compute_winter_gap_residuals,
    risk_class,
    trend_class,
    winter_gap_artifact_flag,
)


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


# ---------------------------------------------------------------------------
# Helpers for gap-residual tests
# ---------------------------------------------------------------------------

def _dates_with_gap(
    obs_before: int,
    gap_days: int,
    obs_after: int,
    start: str = "2021-04-15",
    cadence_days: int = 12,
) -> list[str]:
    """Generate a date list with a deliberate gap."""
    base = np.datetime64(start, "D")
    before = [str(base + np.timedelta64(cadence_days * i, "D")) for i in range(obs_before)]
    gap_start = np.datetime64(before[-1], "D") + np.timedelta64(gap_days, "D")
    after = [
        str(gap_start + np.timedelta64(cadence_days * i, "D"))
        for i in range(obs_after)
    ]
    return before + after


def _linear_series(dates: list[str], slope_mm_per_yr: float, noise_std: float = 0.5) -> list[float]:
    """Displacement series with a fixed linear slope and Gaussian noise."""
    dts = np.asarray(dates, dtype="datetime64[D]")
    years = (dts - dts[0]).astype("timedelta64[D]").astype(float) / 365.25
    rng = np.random.default_rng(42)
    return (slope_mm_per_yr * years + rng.normal(0, noise_std, size=len(years))).tolist()


class TestComputeWinterGapResiduals:
    def test_no_gap_returns_none_max_res(self) -> None:
        # Dense series, no gap > 45 days — no evaluable gap.
        dates = _monthly_dates(3, start="2021-04-15")  # ~37 monthly obs
        dates_str = [d[:10] if "T" in d else d for d in dates]
        values = _linear_series(dates_str, slope_mm_per_yr=-3.0)
        hit, max_res = compute_winter_gap_residuals(dates_str, values)
        assert hit is False
        assert max_res is None

    def test_too_short_returns_none(self) -> None:
        dates = ["2021-04-15", "2021-04-27", "2021-05-09"]
        values = [0.0, -0.1, -0.2]
        hit, max_res = compute_winter_gap_residuals(dates, values)
        assert hit is False
        assert max_res is None

    def test_cycle_slip_28mm_flagged(self) -> None:
        # A 28 mm step exactly at the gap crossing = classic LOS cycle slip.
        dates = _dates_with_gap(obs_before=15, gap_days=150, obs_after=15)
        values_before = _linear_series(dates[:15], slope_mm_per_yr=-2.0, noise_std=0.3)
        # First post-gap obs is 28 mm below the extrapolated trend.
        extrap_at_gap = values_before[-1]  # rough proxy; actual extrapolation is fit-based
        values_after = (
            [extrap_at_gap - 28.0]  # 28 mm step
            + _linear_series(dates[16:], slope_mm_per_yr=-2.0, noise_std=0.3)
        )
        values = values_before + values_after
        hit, max_res = compute_winter_gap_residuals(dates, values)
        assert hit is True, "28 mm step should resonate with Sentinel-1 LOS ambiguity"
        assert max_res is not None and max_res > 20.0

    def test_cycle_slip_25mm_flagged(self) -> None:
        """Validation criterion 1: point 3i1Jj1TqcK — vel=+2.5, max_res ~25 mm.

        Validates the detection *algorithm*: a 25 mm jump is within ±32 % of
        28.3 mm (LOS λ/2) and is therefore flagged as resonant.

        NOTE — data-source caveat: this test uses a synthetic time series,
        not real L2b per-track LOS data. For actual EGMS L3 Ortho-Vertical
        (the current pipeline input), a cycle slip appears in the vertical
        product at a sub-λ/2 magnitude that depends on the asc/desc
        decomposition weights. The test proves the detection mechanism fires
        correctly for a 25 mm jump; it does not prove that the ±32 %
        tolerance is well-calibrated against real L2b measurements.
        See classify._CYCLE_SLIP_RESONANCE_TOL for the full L3 vs. L2b note.
        """
        dates = _dates_with_gap(obs_before=12, gap_days=160, obs_after=12)
        # Small positive velocity (GIA-like): +2.5 mm/yr
        values_before = _linear_series(dates[:12], slope_mm_per_yr=2.5, noise_std=0.4)
        extrap_at_gap = values_before[-1]
        values_after = (
            [extrap_at_gap - 25.0]  # 25 mm step ≈ 0.88 × LOS ambiguity
            + _linear_series(dates[13:], slope_mm_per_yr=2.5, noise_std=0.4)
        )
        values = values_before + values_after
        hit, max_res = compute_winter_gap_residuals(dates, values)
        assert hit is True, "25 mm step should be resonant with 28.3 mm LOS ambiguity (11.7% deviation)"
        assert max_res is not None and 20.0 < max_res < 32.0

    def test_stable_rising_not_flagged(self) -> None:
        """Validation criterion 2: stable/rising points (vel +2.5…+3.3 mm/yr) must not be flagged.

        A continuous linear series with a winter gap but no injected step
        produces only small noise-level jumps that must not resonate.
        Same synthetic-data caveat as test_cycle_slip_25mm_flagged.
        """
        dates = _dates_with_gap(obs_before=15, gap_days=155, obs_after=15)
        # Continuous linear rise, no injected step.
        values = _linear_series(dates, slope_mm_per_yr=3.0, noise_std=0.5)
        hit, max_res = compute_winter_gap_residuals(dates, values)
        assert hit is False, "Stable GIA-like rising point should not resonate"
        if max_res is not None:
            # Even if a small non-resonant jump is measured, it should be tiny
            assert max_res < 15.0

    def test_genuine_deceleration_not_flagged(self) -> None:
        """Validation criterion 3: genuine decelerating clay consolidation must not be flagged.

        Per-segment fitting (not full-series trend) extrapolates the slow
        late-segment slope over the gap → small non-resonant jump.
        """
        # Phase 1 (pre-gap): fast subsidence -8 mm/yr (early clay settlement)
        dates_before = _dates_with_gap(obs_before=20, gap_days=155, obs_after=0)[:20]
        # Phase 2 (post-gap): slow subsidence -2 mm/yr (late consolidation)
        dates_after = [
            str(np.datetime64(dates_before[-1], "D") + np.timedelta64(155 + 12 * i, "D"))
            for i in range(1, 16)
        ]
        dates = dates_before + dates_after

        dts = np.asarray(dates, dtype="datetime64[D]")
        years = (dts - dts[0]).astype("timedelta64[D]").astype(float) / 365.25
        # True displacement: -8 mm/yr for first phase, then -2 mm/yr
        cutoff_yr = years[19]  # last pre-gap point
        values_arr = np.where(
            years <= cutoff_yr,
            -8.0 * years,
            -8.0 * cutoff_yr + (-2.0 * (years - cutoff_yr)),
        )
        rng = np.random.default_rng(7)
        values = (values_arr + rng.normal(0, 0.4, len(values_arr))).tolist()

        hit, max_res = compute_winter_gap_residuals(dates, values)
        assert hit is False, (
            "Genuine decelerating consolidation should not be mistaken for cycle-slip artefact. "
            f"max_res={max_res}"
        )


class TestClassifyFootprintHit:
    def test_kat3_outside_polygon(self) -> None:
        cat, uncertain = classify_footprint_hit(
            inside_polygon=False,
            distance_to_edge_m=None,
        )
        assert cat == "KAT3"
        assert uncertain is False

    def test_kat1_interior_with_height(self) -> None:
        cat, uncertain = classify_footprint_hit(
            inside_polygon=True,
            distance_to_edge_m=5.0,
            height_ortho=15.0,
        )
        assert cat == "KAT1"
        assert uncertain is False

    def test_kat1_uncertain_no_height(self) -> None:
        # Clearly interior but height unknown — structural but uncertain
        cat, uncertain = classify_footprint_hit(
            inside_polygon=True,
            distance_to_edge_m=5.0,
            height_ortho=None,
        )
        assert cat == "KAT1"
        assert uncertain is True

    def test_kat2_near_edge(self) -> None:
        cat, uncertain = classify_footprint_hit(
            inside_polygon=True,
            distance_to_edge_m=1.5,  # below 2.5 m margin
            height_ortho=12.0,
        )
        assert cat == "KAT2"

    def test_kat2_ground_level(self) -> None:
        # Inside footprint but at ground level (h < 8 m)
        cat, uncertain = classify_footprint_hit(
            inside_polygon=True,
            distance_to_edge_m=6.0,
            height_ortho=3.5,
        )
        assert cat == "KAT2"
        assert uncertain is False

    def test_kat2_no_edge_distance(self) -> None:
        # Inside polygon but distance_to_edge unavailable
        cat, uncertain = classify_footprint_hit(
            inside_polygon=True,
            distance_to_edge_m=None,
        )
        assert cat == "KAT2"
        assert uncertain is True


class TestWinterGapArtifactFlag:
    def test_cycle_slip_flagged_regardless_of_velocity(self) -> None:
        """Path A: cycle_slip alone → is_artifact=True even when velocity is within normal range."""
        result = winter_gap_artifact_flag(
            coherence=None,
            mean_velocity_los=2.5,  # small positive, within normal GIA range
            ambiguity_hit=True,
            max_gap_residual_mm=25.0,
        )
        assert result["winter_gap_artifact"] is True
        assert "cycle_slip" in (result["winter_gap_artifact_reason"] or "")

    def test_no_cycle_slip_normal_velocity_not_flagged(self) -> None:
        """Criterion 2: stable rising point — no cycle slip, normal velocity."""
        result = winter_gap_artifact_flag(
            coherence=None,
            mean_velocity_los=3.1,
            ambiguity_hit=False,
            max_gap_residual_mm=3.2,
        )
        assert result["winter_gap_artifact"] is False
        assert result["winter_gap_artifact_reason"] is None

    def test_extreme_uplift_velocity_flagged_by_path_b(self) -> None:
        """Path B: low_coh + unrealistic LOS velocity (> +10 mm/yr)."""
        result = winter_gap_artifact_flag(
            coherence=0.45,  # below 0.60 threshold
            mean_velocity_los=15.0,  # above +10 LOS threshold
            ambiguity_hit=False,
            max_gap_residual_mm=None,
        )
        assert result["winter_gap_artifact"] is True
        reason = result["winter_gap_artifact_reason"] or ""
        assert "low_coh" in reason
        assert "vel=" in reason

    def test_spatial_outlier_recorded_but_not_gate(self) -> None:
        """spatial_outlier is supporting evidence, NOT a gate condition."""
        # Cycle-slip point with spatial_confirmed=True
        result_with = winter_gap_artifact_flag(
            coherence=None,
            mean_velocity_los=2.5,
            ambiguity_hit=True,
            max_gap_residual_mm=28.0,
            is_spatial_outlier=True,
        )
        # Same point without spatial confirmation — must still be flagged
        result_without = winter_gap_artifact_flag(
            coherence=None,
            mean_velocity_los=2.5,
            ambiguity_hit=True,
            max_gap_residual_mm=28.0,
            is_spatial_outlier=False,
        )
        assert result_with["winter_gap_artifact"] is True
        assert result_without["winter_gap_artifact"] is True
        assert result_with["winter_gap_artifact_spatial_confirmed"] is True
        assert result_without["winter_gap_artifact_spatial_confirmed"] is False
