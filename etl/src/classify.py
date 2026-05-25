"""Risk and trend classifiers for InSAR-derived building displacement.

Thresholds match the spec in CLAUDE.md. ``risk_class`` is a pure function
of one number; ``trend_class`` analyses a per-point displacement time
series with linear regression plus a simple FFT-based seasonality check.
"""

from __future__ import annotations

from typing import Sequence

import numpy as np

# Risk thresholds (mm/year, absolute max velocity).
RISK_STABLE_BELOW = 2.0
RISK_MONITOR_BELOW = 5.0
RISK_ATTENTION_BELOW = 10.0

# Trend thresholds.
TREND_STABLE_BELOW_ABS_SLOPE = 1.0  # mm/y
TREND_ACCEL_RATIO = 1.5             # late_slope / early_slope must exceed this
TREND_DECEL_RATIO = 0.5             # late_slope / early_slope must drop below this
TREND_SEASONAL_RESIDUAL_STD = 1.0   # below this, residuals are too small for periodicity
TREND_SEASONAL_PEAK_RATIO = 3.0     # FFT peak in annual band vs median power
TREND_LATE_WINDOW_YEARS = 2.0       # last 24 months for the segmented analysis
TREND_MIN_OBSERVATIONS = 6


def risk_class(max_vel_abs: float) -> str:
    """Classify a building by its max absolute velocity (mm/year)."""
    if max_vel_abs < RISK_STABLE_BELOW:
        return "stable"
    if max_vel_abs < RISK_MONITOR_BELOW:
        return "monitor"
    if max_vel_abs < RISK_ATTENTION_BELOW:
        return "attention"
    return "urgent"


def trend_class(
    dates: Sequence[str] | Sequence[np.datetime64],
    displacement_mm: Sequence[float],
) -> str:
    """Classify the trend of a displacement time series.

    Returns one of: ``stable``, ``linear``, ``accelerating``, ``decelerating``,
    ``seasonal``. Seasonality is checked first so a noisy oscillation around
    zero is not mis-labeled stable.
    """
    x = _years_from_start(dates)
    y = np.asarray(displacement_mm, dtype=float)
    if x.size < TREND_MIN_OBSERVATIONS:
        return "stable"

    overall_slope, intercept = np.polyfit(x, y, 1)
    span_years = x[-1] - x[0]

    # Segmented analysis first: a clear acceleration leaves residuals that
    # can look low-frequency-periodic, so we must decide accel/decel before
    # falling through to the FFT-based seasonality check.
    cutoff = x[-1] - TREND_LATE_WINDOW_YEARS
    early_mask = x < cutoff
    late_mask = x >= cutoff
    if early_mask.sum() >= 3 and late_mask.sum() >= 3:
        early_slope = np.polyfit(x[early_mask], y[early_mask], 1)[0]
        late_slope = np.polyfit(x[late_mask], y[late_mask], 1)[0]
        slope_change_meaningful = (
            np.sign(early_slope) == np.sign(late_slope)
            and abs(early_slope) > 1e-6
            and abs(late_slope - early_slope) >= TREND_STABLE_BELOW_ABS_SLOPE
            and max(abs(early_slope), abs(late_slope)) >= TREND_STABLE_BELOW_ABS_SLOPE
        )
        if slope_change_meaningful:
            ratio = late_slope / early_slope
            if ratio >= TREND_ACCEL_RATIO:
                return "accelerating"
            if 0 < ratio <= TREND_DECEL_RATIO:
                return "decelerating"

    residuals = y - (overall_slope * x + intercept)
    if span_years >= 1.5 and _has_annual_period(x, residuals):
        return "seasonal"

    if abs(overall_slope) < TREND_STABLE_BELOW_ABS_SLOPE:
        return "stable"

    return "linear"


def _years_from_start(dates: Sequence[str] | Sequence[np.datetime64]) -> np.ndarray:
    arr = np.asarray(dates, dtype="datetime64[D]")
    delta_days = (arr - arr[0]).astype("timedelta64[D]").astype(float)
    return delta_days / 365.25


def _has_annual_period(x_years: np.ndarray, residuals: np.ndarray) -> bool:
    """Detect a ~1-year periodic component via FFT on a resampled grid.

    A pure trend kink (acceleration/deceleration) produces low-frequency
    residuals that can masquerade as seasonality if we only look at the
    annual band in isolation. We therefore require the peak in the annual
    band to dominate the *entire* spectrum above 0.5 cycles/year — that
    rules out slow bends without losing real annual cycles.
    """
    if residuals.size < 12 or float(np.std(residuals)) < TREND_SEASONAL_RESIDUAL_STD:
        return False
    span = float(x_years[-1] - x_years[0])
    if span <= 0:
        return False
    n = max(32, int(span * 24))  # ~bi-monthly sampling for stable FFT
    grid = np.linspace(x_years[0], x_years[-1], n)
    resampled = np.interp(grid, x_years, residuals)
    resampled = resampled - resampled.mean()
    spectrum = np.abs(np.fft.rfft(resampled))
    freqs = np.fft.rfftfreq(n, d=span / (n - 1))  # cycles per year
    valid = freqs >= 0.5
    band = (freqs >= 0.7) & (freqs <= 1.4)
    if not valid.any() or not band.any() or spectrum.size <= 2:
        return False
    peak_in_band = float(spectrum[band].max())
    peak_overall = float(spectrum[valid].max())
    background = float(np.median(spectrum[1:]))
    if background <= 0 or peak_overall <= 0:
        return False
    dominant = peak_in_band >= 0.9 * peak_overall
    above_noise = peak_in_band >= TREND_SEASONAL_PEAK_RATIO * background
    return dominant and above_noise
