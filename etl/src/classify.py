"""Risk and trend classifiers for InSAR-derived building displacement.

Thresholds match the spec in CLAUDE.md. ``risk_class`` is a pure function
of one number; ``trend_class`` analyses a per-point displacement time
series with linear regression plus a simple FFT-based seasonality check.
``compute_winter_gap_residuals`` detects Sentinel-1 cycle-slip artefacts
from per-segment gap jumps; ``winter_gap_artifact_flag`` assembles the
evidence into a structured flag dict. ``classify_footprint_hit`` gives the
three-way KAT1/KAT2/KAT3 footprint-relation output.

All functions produce flags/categories — they never drop points silently.
"""

from __future__ import annotations

import math
from typing import Sequence

import numpy as np

# Risk thresholds (mm/year, absolute max velocity).
RISK_STABLE_BELOW = 2.0
RISK_MONITOR_BELOW = 5.0
RISK_ATTENTION_BELOW = 10.0

# ---------------------------------------------------------------------------
# Winter-gap / cycle-slip artifact detection
# ---------------------------------------------------------------------------
# Applied to approximate LOS velocity (mm/yr), NOT decomposed vertical.
# Caller converts EGMS L3 vertical → LOS via cos(incidence) before passing.
# Evaluate asc/desc tracks separately pre-decomposition when L2 data is
# available; current MVP uses the L3 Ortho product with an incidence
# projection approximation (see spatial_join._TURKU_INCIDENCE_COS).
#
# Thresholds are asymmetric (LOS mm/yr):
#   Uplift: Turku GIA ≈ +3 mm/yr LOS → > +10 is non-physical.
#   Subsidence: -20 leaves room for genuine clay/peat consolidation;
#     the cycle-slip resonance test distinguishes artefact within this range.
_ARTIFACT_VEL_UPLIFT_LOS     = 10.0   # mm/yr LOS, NOT decomposed vertical
_ARTIFACT_VEL_SUBSIDENCE_LOS = 20.0   # mm/yr LOS (absolute), NOT decomposed vertical
_ARTIFACT_RESIDUAL_MM        = 10.0   # minimum jump size to qualify as cycle-slip evidence
_ARTIFACT_COHERENCE_THRESH   = 0.60   # below this, coherence is flagged low

# Sentinel-1 C-band half-ambiguity (λ/2). A phase cycle slip (2π wrap
# error) shifts the apparent displacement by ±n × λ/2 in LOS space.
# C-band: λ = 5.6 cm → λ/2 = 28.3 mm.
_CYCLE_SLIP_HALF_AMB_LOS_MM = 28.3
# Nominal Sentinel-1 IW incidence angle over Turku (≈ 38°, ascending).
# Geometric projection of a LOS cycle slip to the vertical component:
#   v_vert = v_los / cos(θ) ≈ 28.3 / cos(38°) ≈ 35.9 mm.
_CYCLE_SLIP_INCIDENCE_DEG = 38.0
_CYCLE_SLIP_VERT_MM = _CYCLE_SLIP_HALF_AMB_LOS_MM / math.cos(
    math.radians(_CYCLE_SLIP_INCIDENCE_DEG)
)  # ≈ 35.9 mm
# A gap-jump is "resonant" if |jump − n×ref| / ref ≤ this tolerance.
# IMPORTANT — L3 vs. L2b scope of the resonance check:
#   EGMS L3 Ortho-Vertical (CURRENT MVP — the only implemented path):
#     The vertical product is already decomposed from ascending + descending
#     tracks. A single-track cycle slip of 28.3 mm LOS appears in the
#     vertical product at an unpredictable magnitude depending on
#     decomposition weights — typically well below 35.9 mm if one track
#     slipped and the other did not. The resonance check therefore operates
#     as a *heuristic anomaly detector*, not a rigorous λ/2 test. It catches
#     large suspicious jumps but may miss sub-ambiguity slips from one weak
#     track and may flag non-resonant large jumps.
#   Raw per-track L2b LOS (NOT IMPLEMENTED — TODO):
#     Would preserve λ/2 quantisation per track; resonance check would be
#     physically meaningful. Requires fetch_egms.py to load L2b asc/desc
#     tiles and evaluate each track separately before decomposition.
_CYCLE_SLIP_RESONANCE_TOL = 0.32
# Gaps shorter than _GAP_MIN_DAYS are routine within-season acquisitions.
# Longer gaps spanning season boundaries are the cycle-slip candidates.
_GAP_MIN_DAYS = 45
# Minimum pre-gap observations to fit a reliable per-segment linear trend.
_MIN_SEGMENT_OBS = 4

# ---------------------------------------------------------------------------
# Building footprint classification (TASK 3, quality brief 2026-06-14)
# ---------------------------------------------------------------------------
_FOOTPRINT_INTERIOR_MARGIN_M = 2.5
# Height proxy: EGMS L3 height_ortho above EGM2008 geoid.
# The 8 m threshold separates roof-level scatterers from ground-level ones
# in Turku's low-lying coastal topography. Unreliable where local terrain
# exceeds 5–8 m (e.g. Ruissalo hills).
# TODO: subtract NLS DTM10 per-point to compute h_above_local_ground.
_FOOTPRINT_LOW_HEIGHT_M = 8.0

# Trend thresholds.
TREND_STABLE_BELOW_ABS_SLOPE = 1.0  # mm/y
TREND_ACCEL_RATIO = 1.5             # late_slope / early_slope must exceed this
TREND_DECEL_RATIO = 0.5             # late_slope / early_slope must drop below this
TREND_SEASONAL_RESIDUAL_STD = 1.0   # below this, residuals are too small for periodicity
TREND_SEASONAL_PEAK_RATIO = 3.0     # FFT peak in annual band vs median power
TREND_LATE_WINDOW_YEARS = 2.0       # last 24 months for the segmented analysis
TREND_MIN_OBSERVATIONS = 6


def winter_gap_artifact_flag(
    *,
    coherence: float | None,
    mean_velocity_los: float,
    ambiguity_hit: bool,
    max_gap_residual_mm: float | None,
    is_spatial_outlier: bool | None = None,
) -> dict[str, object]:
    """Flag a point for winter-gap phase artifact. Never removes — caller decides.

    Flagging logic: (low_coh OR cycle_slip) AND unrealistic LOS velocity.
    spatial_outlier is supporting evidence recorded in the reason string but is
    NOT a gate: cluster-interior points share contaminated neighbors, so the
    spatial test is blind to the largest artifact clusters.

    Always include the returned dict in the output record so manual reviewers
    can see the evidence. Do not silently drop flagged points.

    # TODO: L3-pisteiden koordinaattikäsittely (3035 vs. navigointi) tarkistettava
    # ennen kuin tätä lippua sovelletaan L3-dataan. Testipisteet 30pKZVQ8Rb ja
    # 30pKwwkMPv sivuutettu koordinaattiepävarmuuden takia — ei poistettu.
    """
    reasons: list[str] = []

    low_coh = coherence is not None and coherence < _ARTIFACT_COHERENCE_THRESH
    if low_coh:
        reasons.append("low_coh")

    cycle_slip = (
        ambiguity_hit
        and max_gap_residual_mm is not None
        and max_gap_residual_mm > _ARTIFACT_RESIDUAL_MM
    )
    if cycle_slip:
        reasons.append("cycle_slip")

    # LOS mm/yr, NOT decomposed vertical; asc/desc evaluated separately pre-decomposition
    vel_unrealistic = (
        mean_velocity_los > _ARTIFACT_VEL_UPLIFT_LOS
        or mean_velocity_los < -_ARTIFACT_VEL_SUBSIDENCE_LOS
    )
    if vel_unrealistic:
        reasons.append(f"vel={mean_velocity_los:+.1f}mm_yr_LOS")

    if is_spatial_outlier:
        reasons.append("spatial_confirmed")

    # Path A: cycle_slip alone is sufficient — λ/2 resonance is specific enough.
    # One-time slips average out in mean_velocity so a velocity gate would miss them.
    # Path B: low_coh + unrealistic velocity catches baseline slips (slip before
    # observation period, not visible in per-gap residuals) and other high-vel artifacts.
    if cycle_slip:
        is_artifact = True
        reasons.insert(0, "via:cycle_slip_resonance")
    elif low_coh and vel_unrealistic:
        is_artifact = True
        reasons.insert(0, "via:low_coh_vel")
    else:
        is_artifact = False

    return {
        "winter_gap_artifact": is_artifact,
        "winter_gap_artifact_reason": "|".join(reasons) if is_artifact else None,
        "winter_gap_artifact_spatial_confirmed": bool(is_spatial_outlier) if is_artifact else None,
    }


def compute_winter_gap_residuals(
    dates: Sequence[str | np.datetime64],
    displacement_mm: Sequence[float],
) -> tuple[bool, float | None]:
    """Per-segment linear fit and inter-gap jump test for cycle-slip resonance.

    For each gap > _GAP_MIN_DAYS in the observation sequence, fits a linear
    trend to the *segment immediately before the gap* (between the previous
    gap and the current one, or the series start). Extrapolates to the first
    post-gap observation and measures the jump = actual − predicted.

    Using only the immediately-preceding segment (not the full pre-gap
    history) is essential for non-linear motion: a genuinely decelerating
    consolidation series has a shallow late slope, so the per-segment fit
    extrapolates close to the actual post-gap value, producing a small
    non-resonant jump. Full-history fitting would bias the slope high,
    falsely implicating deceleration as an artefact.

    A jump is "resonant" if |jump − n×ref| / ref ≤ _CYCLE_SLIP_RESONANCE_TOL
    for any integer n ≥ 1, tested against both LOS (_CYCLE_SLIP_HALF_AMB_LOS_MM
    = 28.3 mm) and vertical (_CYCLE_SLIP_VERT_MM ≈ 35.9 mm) ambiguity units
    to cover incidence-angle uncertainty in the EGMS L3 Ortho decomposition.

    Returns (ambiguity_hit, max_gap_residual_mm):
      ambiguity_hit: True if any gap shows cycle-slip resonance.
      max_gap_residual_mm: absolute value of the largest gap jump, or None
        if no gap is evaluable (too short, too few pre-gap observations, etc.).

    KNOWN BLIND SPOT — baseline slip: a cycle slip that occurred before the
    first observation produces a uniform DC offset with no intra-series jump.
    Per-gap test returns (False, None) for such a flat-offset series.
    Only GNSS anchoring against an absolute reference (e.g. a FinnRef CORS
    station nearby) can detect baseline slips.
    TODO: GNSS ankkurointi (FinnRef / NKG absolute reference frame).

    KNOWN LIMITATION — current implementation uses L3 only (NOT IMPLEMENTED:
    per-track L2b LOS evaluation). This function is always called with EGMS
    L3 Ortho-Vertical displacement, already decomposed from asc + desc tracks.
    The λ/2 resonance check is physically meaningful only for raw per-track
    L2b LOS data, where phase quantisation is still intact. On L3, a
    single-track cycle slip of 28.3 mm LOS appears in the vertical product
    at an unpredictable sub-λ/2 magnitude depending on decomposition weights.
    The resonance test therefore acts as a *heuristic anomaly detector*:
      (a) sub-ambiguity slips from one weak track are under-detected;
      (b) the 32 % resonance tolerance is calibrated on synthetic data,
          not validated against actual L2b LOS measurements.
    TODO (backlog, prioritised): load L2b asc/desc tiles in fetch_egms.py,
    evaluate each track separately pre-decomposition — this is what makes
    the λ/2 resonance test physically precise rather than heuristic.
    """
    dts = np.asarray(dates, dtype="datetime64[D]")
    vals = np.asarray(displacement_mm, dtype=float)
    order = np.argsort(dts)
    dts, vals = dts[order], vals[order]

    n = len(dts)
    if n < _MIN_SEGMENT_OBS + 1:
        return False, None

    days = (dts - dts[0]).astype("timedelta64[D]").astype(float)
    inter_gaps = np.diff(dts).astype("timedelta64[D]").astype(float)
    gap_positions = np.where(inter_gaps > _GAP_MIN_DAYS)[0]

    if len(gap_positions) == 0:
        return False, None

    max_abs_jump = 0.0
    any_resonant = False

    for i, gap_idx in enumerate(gap_positions):
        # Segment before this gap: from end of previous gap (or series start)
        # to the last observation before the current gap.
        seg_start = int(gap_positions[i - 1]) + 1 if i > 0 else 0
        seg_end = int(gap_idx) + 1  # exclusive; includes point at gap_idx
        post_start = int(gap_idx) + 1

        if (seg_end - seg_start) < _MIN_SEGMENT_OBS or post_start >= n:
            continue

        seg_x = days[seg_start:seg_end]
        seg_y = vals[seg_start:seg_end]
        slope, intercept = np.polyfit(seg_x, seg_y, 1)

        # Extrapolate the pre-gap segment trend to the first post-gap date.
        predicted = slope * float(days[post_start]) + intercept
        jump = float(vals[post_start]) - predicted
        abs_jump = abs(jump)

        if abs_jump > max_abs_jump:
            max_abs_jump = abs_jump

        # Resonance check: test both LOS and vertical ambiguity units.
        for ref_mm in (_CYCLE_SLIP_HALF_AMB_LOS_MM, _CYCLE_SLIP_VERT_MM):
            n_ambig = round(abs_jump / ref_mm)
            if n_ambig < 1:
                continue
            expected = n_ambig * ref_mm
            if abs(abs_jump - expected) / expected <= _CYCLE_SLIP_RESONANCE_TOL:
                any_resonant = True
                break

    if max_abs_jump == 0.0:
        return False, None

    return any_resonant, max_abs_jump


def classify_footprint_hit(
    inside_polygon: bool,
    distance_to_edge_m: float | None,
    height_ortho: float | None = None,
    *,
    interior_margin_m: float = _FOOTPRINT_INTERIOR_MARGIN_M,
    low_height_m: float = _FOOTPRINT_LOW_HEIGHT_M,
) -> tuple[str, bool]:
    """Three-way classification of an EGMS point's relation to a building footprint.

    ``inside_polygon`` and ``distance_to_edge_m`` must be computed in the same
    metric CRS — EPSG:3067 (TM35FIN) for this pipeline. Never mix EPSG:3035
    and EPSG:3067 before calling.

    Returns (category, uncertain):
      'KAT1': inside footprint, ≥ interior_margin_m from edge, and
              height_ortho ≥ low_height_m (or height unknown).
              Likely structural scatterer. Still flag for manual review —
              do NOT auto-classify as "building subsides" without review.
      'KAT2': inside footprint but near the polygon edge (< interior_margin_m),
              or at ground level (height_ortho < low_height_m). Ambiguous:
              could be wall scatter, inner courtyard, or adjacent ground.
      'KAT3': outside the footprint (buffer zone). Likely parking, fill,
              or yard — structural inference not supported.

    uncertain=True when the assignment is borderline: e.g. height unavailable
    for a clearly-interior point, or distance_to_edge_m not computable.
    Borderline KAT2 edge hits also set uncertain=True.
    """
    if not inside_polygon:
        return "KAT3", False

    height_below = height_ortho is not None and height_ortho < low_height_m
    height_unknown = height_ortho is None

    if height_below:
        return "KAT2", False

    margin_sufficient = (
        distance_to_edge_m is not None and distance_to_edge_m >= interior_margin_m
    )
    margin_unknown = distance_to_edge_m is None

    if margin_unknown:
        # Cannot determine interior margin — call it KAT2 uncertain
        return "KAT2", True

    if not margin_sufficient:
        # Near-edge: structurally ambiguous; uncertain if height unverifiable
        return "KAT2", height_unknown

    # Clearly interior, not at known ground level
    return "KAT1", height_unknown  # uncertain only when height cannot be verified


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
