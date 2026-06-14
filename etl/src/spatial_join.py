"""Spatial join: EGMS InSAR points into MML building polygons.

Aggregates per-point displacement statistics into per-building summaries
and applies a hybrid trend classifier. Trend logic prefers EGMS's
pre-computed ``seasonality`` and ``seasonality_std`` to flag seasonal
buildings; everything else falls through to the FFT/segmented logic in
``classify.trend_class`` applied to the per-building aggregate series.

When ``timeseries`` is provided, each EGMS point is also checked for
winter-gap cycle-slip artefacts (``classify.compute_winter_gap_residuals``
+ ``winter_gap_artifact_flag``). Flagged points are never silently dropped;
their flags propagate to building-level columns ``has_artifact_flag``,
``artifact_reasons``, and ``risk_class_uncertain`` in the output.

Building footprint relation is classified as KAT1/KAT2/KAT3 via
``classify.classify_footprint_hit``, giving the report layer visibility
into whether a risk signal originates inside the structural footprint or
from a parking lot / fill zone assigned via the 75 m buffer.
"""

from __future__ import annotations

import math

import geopandas as gpd
import pandas as pd
import polars as pl

from .classify import (
    TREND_MIN_OBSERVATIONS,
    classify_footprint_hit,
    compute_winter_gap_residuals,
    risk_class,
    trend_class,
    winter_gap_artifact_flag,
)

# Quality filter (CLAUDE.md, refined for EGMS v3 release 2020-2024).
MAX_VELOCITY_STD = 1.5  # mm/y, strict less-than
# Approximate LOS projection factor for the Turku area.
# Sentinel-1 IW nominal incidence angle ≈ 38°; cos(38°) ≈ 0.788.
# Used only for the plausibility VELOCITY GATE: converts EGMS L3 vertical
# mean velocity → approximate LOS before winter_gap_artifact_flag (Path B).
# The resonance test (Path A) operates on the L3 vertical time series — it
# does NOT use this factor. Per-track L2b LOS evaluation is NOT IMPLEMENTED.
# TODO (backlog, prioritised): load L2b asc/desc tiles in fetch_egms.py to
# make the resonance test physically precise instead of heuristic.
_TURKU_INCIDENCE_COS = math.cos(math.radians(38.0))
# Physical plausibility cap: anything beyond is active excavation or a
# phase-unwrapping artefact, not building motion. Drops a handful of
# raw EGMS points per Turku run.
MAX_PLAUSIBLE_VELOCITY_MM_Y = 50.0

# EGMS Ortho L3 is a 100 m grid (resampled from 20×5 m PS). A small
# building rarely contains a grid point, so we accept every point within
# ``BUFFER_DISTANCE_M`` of the polygon and weight by distance with
# falloff ``DISTANCE_WEIGHT_FALLOFF_M``. ``MIN_POINTS_PER_BUILDING`` is
# 1 because reliability comes from EGMS's per-point ``mean_velocity_std``,
# not statistical redundancy. See memory: spatial-join-strategy.
BUFFER_DISTANCE_M = 75.0
DISTANCE_WEIGHT_FALLOFF_M = 25.0
MIN_POINTS_PER_BUILDING = 1

# Hybrid seasonal detector thresholds (per-building medians of contained points).
SEASONAL_AMPLITUDE_MIN_MM = 1.5
SEASONAL_STD_MAX_MM = 1.0


def filter_points(points: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    """Drop EGMS points failing uncertainty or physical-plausibility gates."""
    required = {"mean_velocity", "mean_velocity_std"}
    missing = required - set(points.columns)
    if missing:
        raise ValueError(f"points missing required columns: {sorted(missing)}")
    mask = (
        points["mean_velocity"].notna()
        & points["mean_velocity_std"].notna()
        & (points["mean_velocity_std"] < MAX_VELOCITY_STD)
        & (points["mean_velocity"].abs() <= MAX_PLAUSIBLE_VELOCITY_MM_Y)
    )
    return points.loc[mask].copy()


def aggregate_to_buildings(
    buildings: gpd.GeoDataFrame,
    points: gpd.GeoDataFrame,
    timeseries: pl.DataFrame | None = None,
    regional_baseline_mm_y: float | None = None,
) -> tuple[gpd.GeoDataFrame, pd.DataFrame]:
    """Spatial-join EGMS points into building polygons and compute stats.

    ``buildings`` must carry ``building_id`` and be in EPSG:3067.
    ``points`` is the EGMS metadata GeoDataFrame from ``fetch_egms``.
    ``timeseries`` is the optional long-format displacement frame; when
    provided, per-building ``trend_class`` is computed via the hybrid
    logic, otherwise it is left as ``None``.

    ``regional_baseline_mm_y`` is the area-wide median velocity that
    represents postglacial isostatic adjustment (Finland rises ~5 mm/y).
    When provided, the output gains ``velocity_anomaly_mm_y`` (signed
    deviation from baseline) and ``anomaly_class`` (risk thresholds
    applied to |anomaly|).

    Returns ``(buildings_with_stats, point_assignments)``. The buildings
    frame adds these columns: ``mean_velocity_mm_y``, ``max_velocity_mm_y``,
    ``velocity_std``, ``point_count``, ``nearest_point_distance_m``,
    ``acceleration_mean``, ``seasonality_mean``, ``risk_class``,
    ``trend_class``, and (when a baseline is given)
    ``velocity_anomaly_mm_y``, ``anomaly_class``, ``trend_class_anomaly``,
    ``gia_baseline_mm_y``. The point-assignments frame is the (pid,
    building_id, distance_m, weight) mapping that downstream exports
    use to attribute time-series rows to buildings.
    """
    if buildings.crs is None or points.crs is None:
        raise ValueError("Both inputs require an explicit CRS")
    if buildings.crs != points.crs:
        raise ValueError(f"CRS mismatch: {buildings.crs} vs {points.crs}")
    if "building_id" not in buildings.columns:
        raise ValueError("buildings must have a 'building_id' column")

    valid_points = filter_points(points)

    # Buffer building footprints, then match every point that falls within
    # the buffered polygon. Distance is measured to the ORIGINAL (unbuffered)
    # polygon so on-roof points get distance 0 and edge points get the true
    # offset that drives the inverse-distance weighting.
    building_cols = buildings[["building_id", "geometry"]].copy()
    buffered = building_cols.copy()
    buffered["geometry"] = buffered.geometry.buffer(BUFFER_DISTANCE_M)
    joined = gpd.sjoin(
        valid_points,
        buffered,
        predicate="within",
        how="inner",
    ).drop(columns=["index_right"])

    original_geom = building_cols.rename(columns={"geometry": "_building_geom"})
    joined = joined.merge(original_geom, on="building_id", how="left")
    building_series = gpd.GeoSeries(
        joined["_building_geom"].values, index=joined.index, crs=valid_points.crs
    )
    joined["distance_m"] = joined.geometry.distance(building_series)
    joined["weight"] = 1.0 / (1.0 + joined["distance_m"] / DISTANCE_WEIGHT_FALLOFF_M)
    joined["_v_w"] = joined["mean_velocity"] * joined["weight"]
    joined["_abs_v_w"] = joined["mean_velocity"].abs() * joined["weight"]

    # Footprint classification (KAT1/KAT2/KAT3) — uses _building_geom before drop.
    joined = _add_footprint_categories(joined)
    joined = joined.drop(columns=["_building_geom"])

    # Per-point winter-gap cycle-slip artefact flags (requires time series).
    # Flags are joined back to `joined` so _weighted_aggregate can aggregate them.
    if timeseries is not None:
        artifact_df = _compute_artifact_flags(joined, timeseries)
        joined = joined.join(artifact_df, on="pid", how="left")
        joined["winter_gap_artifact"] = (
            joined["winter_gap_artifact"].fillna(False).astype(bool)
        )
    else:
        joined["winter_gap_artifact"] = False
        joined["winter_gap_artifact_reason"] = None
        joined["winter_gap_artifact_spatial_confirmed"] = None

    grouped = (
        joined.groupby("building_id")
        .apply(_weighted_aggregate, include_groups=False)
        .reset_index()
    )

    out = buildings.merge(grouped, on="building_id", how="left")
    out["point_count"] = out["point_count"].fillna(0).astype(int)

    # Artifact and footprint columns — always present with safe defaults.
    # Buildings with no EGMS points get 0 counts and False flags.
    for _col, _default in [
        ("artifact_point_count", 0),
        ("kat1_count", 0),
        ("kat2_count", 0),
        ("kat3_count", 0),
        ("footprint_uncertain_count", 0),
    ]:
        if _col in out.columns:
            out[_col] = out[_col].fillna(0).astype(int)
        else:
            out[_col] = 0

    if "artifact_reasons" not in out.columns:
        out["artifact_reasons"] = None

    out["has_artifact_flag"] = out["artifact_point_count"] > 0
    # risk_class_uncertain: True only when a cycle-slip artefact flag was
    # raised for one or more contributing EGMS points.
    #
    # NOTE: we do NOT flag KAT3-only buildings (all points outside footprint)
    # as uncertain here, even though structural inference from buffer-zone
    # points is technically weaker. Reason: EGMS L3 uses a 100 m grid, so
    # the vast majority of Finnish buildings (~97 % in Turku) have all their
    # assigned points in the buffer zone by design — flagging them all as
    # uncertain produces a near-universal flag that carries no signal.
    # KAT1/KAT2/KAT3 counts remain in the output as informational fields for
    # the report layer to use contextually (e.g. "signal from parking lot").
    out["risk_class_uncertain"] = out["has_artifact_flag"]

    has_data = out["point_count"] >= MIN_POINTS_PER_BUILDING
    out["risk_class"] = pd.Series("insufficient_data", index=out.index, dtype=object)
    out.loc[has_data, "risk_class"] = (
        out.loc[has_data, "max_velocity_mm_y"].abs().map(risk_class)
    )

    if regional_baseline_mm_y is not None:
        out["gia_baseline_mm_y"] = regional_baseline_mm_y
        out["velocity_anomaly_mm_y"] = (
            out["mean_velocity_mm_y"] - regional_baseline_mm_y
        )
        out["anomaly_class"] = pd.Series(
            "insufficient_data", index=out.index, dtype=object
        )
        out.loc[has_data, "anomaly_class"] = (
            out.loc[has_data, "velocity_anomaly_mm_y"].abs().map(risk_class)
        )

    out["trend_class"] = None
    out["trend_class_anomaly"] = None
    if timeseries is not None:
        trend_map, anomaly_trend_map = _classify_trends(
            joined,
            timeseries,
            out.loc[has_data],
            regional_baseline_mm_y=regional_baseline_mm_y,
        )
        out.loc[has_data, "trend_class"] = (
            out.loc[has_data, "building_id"].map(trend_map)
        )
        if anomaly_trend_map is not None:
            out.loc[has_data, "trend_class_anomaly"] = (
                out.loc[has_data, "building_id"].map(anomaly_trend_map)
            )

    # Public point→building mapping with distance + weight for downstream
    # exports (timeseries parquet). Sorted for stable test/snapshot output.
    point_assignments = (
        joined[["pid", "building_id", "distance_m", "weight"]]
        .sort_values(["pid", "building_id"])
        .reset_index(drop=True)
    )

    # Drop helper cols from the public output.
    out = out.drop(columns=["_seas_median", "_seas_std_median"])
    return out, point_assignments


def _add_footprint_categories(joined: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    """Compute KAT1/KAT2/KAT3 footprint relation for each (point, building) row.

    Must be called before _building_geom is dropped from joined. All
    geometries are assumed to be in the same CRS (EPSG:3067).
    """
    joined = joined.copy()
    inside_mask = joined["distance_m"] == 0.0
    joined["inside_footprint"] = inside_mask
    joined["dist_to_edge_m"] = float("nan")

    if inside_mask.any():
        inside_idx = joined.index[inside_mask]
        exterior_rings = gpd.GeoSeries(
            [geom.exterior for geom in joined.loc[inside_idx, "_building_geom"]],
            index=inside_idx,
            crs=joined.crs,
        )
        joined.loc[inside_idx, "dist_to_edge_m"] = (
            joined.loc[inside_idx].geometry.distance(exterior_rings).values
        )

    height_col = "height_ortho" if "height_ortho" in joined.columns else None

    cats_uncertain = [
        classify_footprint_hit(
            inside_polygon=bool(row["inside_footprint"]),
            distance_to_edge_m=(
                float(row["dist_to_edge_m"])
                if not pd.isna(row["dist_to_edge_m"])
                else None
            ),
            height_ortho=(
                float(row[height_col])
                if height_col and not pd.isna(row.get(height_col))
                else None
            ),
        )
        for _, row in joined.iterrows()
    ]
    joined["footprint_cat"] = [c[0] for c in cats_uncertain]
    joined["footprint_uncertain"] = [c[1] for c in cats_uncertain]
    return joined


def _compute_artifact_flags(
    joined: gpd.GeoDataFrame,
    timeseries: pl.DataFrame,
) -> pd.DataFrame:
    """Compute winter-gap cycle-slip artefact flags per unique pid.

    Returns a DataFrame indexed by pid with columns:
      winter_gap_artifact (bool), winter_gap_artifact_reason (str|None),
      winter_gap_artifact_spatial_confirmed (bool|None).

    Two distinct inputs go to winter_gap_artifact_flag — with different
    levels of physical fidelity:

    (A) VELOCITY GATE (Path B in winter_gap_artifact_flag):
        vel_los_approx = mean_velocity_vert × cos(38°)
        Converts EGMS L3 vertical mean velocity to approximate LOS using
        the nominal Turku incidence angle. Defensible for the plausibility
        gate (is +12 mm/yr LOS realistic in Finland?) even though the L3
        product is already decomposed — the gate just needs order-of-magnitude
        reasonableness, not per-track precision.

    (B) RESONANCE TEST (Path A, compute_winter_gap_residuals):
        NOT IMPLEMENTED for L2b — currently always uses L3 Ortho-Vertical.
        Operates on the L3 vertical displacement TIME SERIES. Phase
        quantisation (λ/2 = 28.3 mm) is a per-track LOS property; after
        EGMS L3 decomposition it is no longer preserved. The resonance check
        is a *heuristic anomaly detector* on L3, not a rigorous λ/2 test.
        See classify.compute_winter_gap_residuals docstring (KNOWN LIMITATION).
        TODO (backlog): load L2b asc/desc tiles in fetch_egms.py and evaluate
        per-track pre-decomposition to make resonance physically precise.
    """
    unique_pids = joined["pid"].unique().tolist()
    ts_pd = (
        timeseries.filter(pl.col("pid").is_in(unique_pids))
        .sort(["pid", "date"])
        .to_pandas()
    )
    pid_vel = (
        joined[["pid", "mean_velocity"]]
        .drop_duplicates("pid")
        .set_index("pid")["mean_velocity"]
    )

    records: list[dict] = []
    for pid_val, grp in ts_pd.groupby("pid"):
        vel_vert = float(pid_vel.loc[pid_val]) if pid_val in pid_vel.index else 0.0
        # LOS mm/yr, NOT decomposed vertical; asc/desc evaluated separately pre-decomposition
        vel_los_approx = vel_vert * _TURKU_INCIDENCE_COS

        ambiguity_hit, max_res = compute_winter_gap_residuals(
            grp["date"].tolist(), grp["displacement_mm"].tolist()
        )
        flags = winter_gap_artifact_flag(
            coherence=None,  # EGMS L3 Ortho does not provide raw coherence per point
            mean_velocity_los=vel_los_approx,
            ambiguity_hit=ambiguity_hit,
            max_gap_residual_mm=max_res,
        )
        records.append({"pid": pid_val, **flags})

    if not records:
        return pd.DataFrame(
            columns=[
                "winter_gap_artifact",
                "winter_gap_artifact_reason",
                "winter_gap_artifact_spatial_confirmed",
            ],
            dtype=object,
        )

    return pd.DataFrame(records).set_index("pid")


def _classify_trends(
    joined: gpd.GeoDataFrame,
    timeseries: pl.DataFrame,
    buildings_with_data: gpd.GeoDataFrame,
    regional_baseline_mm_y: float | None = None,
) -> tuple[dict[str, str], dict[str, str] | None]:
    """Hybrid trend classification on raw and (optionally) anomaly series.

    Returns ``(raw_trend, anomaly_trend)``. ``anomaly_trend`` is ``None``
    when ``regional_baseline_mm_y`` is not given; otherwise it is the
    same classifier applied to ``displacement − baseline · years_elapsed``.
    """
    seasonal_lookup = buildings_with_data.set_index("building_id")[
        ["_seas_median", "_seas_std_median"]
    ].to_dict("index")

    point_to_building = pl.from_pandas(
        joined[["pid", "building_id"]].drop_duplicates()
    )
    per_building_ts = (
        timeseries.join(point_to_building, on="pid", how="inner")
        .group_by(["building_id", "date"])
        .agg(pl.col("displacement_mm").mean())
        .sort(["building_id", "date"])
    )

    raw_result: dict[str, str] = {}
    anomaly_result: dict[str, str] = {}
    do_anomaly = regional_baseline_mm_y is not None
    for keys, group in per_building_ts.group_by("building_id", maintain_order=True):
        bid = keys[0] if isinstance(keys, tuple) else keys
        seas = seasonal_lookup.get(bid, {})
        seas_median = seas.get("_seas_median")
        seas_std_median = seas.get("_seas_std_median")
        seasonal_flag = (
            seas_median is not None
            and seas_std_median is not None
            and seas_std_median < SEASONAL_STD_MAX_MM
            and abs(seas_median) > SEASONAL_AMPLITUDE_MIN_MM
        )
        if seasonal_flag:
            raw_result[bid] = "seasonal"
            if do_anomaly:
                anomaly_result[bid] = "seasonal"
            continue
        if len(group) < TREND_MIN_OBSERVATIONS:
            raw_result[bid] = "stable"
            if do_anomaly:
                anomaly_result[bid] = "stable"
            continue
        dates = group["date"].cast(pl.Utf8).to_list()
        values = group["displacement_mm"].to_list()
        raw_result[bid] = trend_class(dates, values)
        if do_anomaly:
            anomaly_values = _detrend(dates, values, regional_baseline_mm_y)
            anomaly_result[bid] = trend_class(dates, anomaly_values)
    return raw_result, (anomaly_result if do_anomaly else None)


def _detrend(
    dates: list[str], values: list[float], baseline_mm_per_y: float
) -> list[float]:
    """Subtract baseline · years_elapsed from each displacement reading."""
    import numpy as np
    arr = np.asarray(dates, dtype="datetime64[D]")
    years = (arr - arr[0]).astype("timedelta64[D]").astype(float) / 365.25
    vals = np.asarray(values, dtype=float)
    return (vals - baseline_mm_per_y * years).tolist()


def _signed_max_abs(series: pd.Series) -> float:
    """Return the value with the largest absolute magnitude, keeping its sign."""
    if series.empty:
        return float("nan")
    idx = series.abs().idxmax()
    return float(series.loc[idx])


def _weighted_aggregate(group: pd.DataFrame) -> pd.Series:
    """Distance-weighted per-building aggregates for one sjoin group.

    Mean velocity is the inverse-distance-weighted mean; max velocity is
    the signed velocity of the point with the largest |v|·weight (so a
    closer 6 mm/y point outranks a 75 m-away 7 mm/y point).

    Also aggregates artifact flags and footprint categories so the report
    layer can distinguish structural signal from artefact / fill / parking.
    """
    weight_sum = group["weight"].sum()
    weighted_mean = group["_v_w"].sum() / weight_sum
    max_idx = group["_abs_v_w"].idxmax()

    # Artifact flag aggregation — count flagged points, collect unique reasons.
    if "winter_gap_artifact" in group.columns:
        artifact_mask = group["winter_gap_artifact"].astype(bool)
        artifact_count = int(artifact_mask.sum())
        if artifact_count and "winter_gap_artifact_reason" in group.columns:
            unique_reasons = sorted(
                r
                for r in group.loc[artifact_mask, "winter_gap_artifact_reason"].dropna().unique()
                if r
            )
            artifact_reasons: str | None = "|".join(unique_reasons) or None
        else:
            artifact_reasons = None
    else:
        artifact_count = 0
        artifact_reasons = None

    # Footprint category distribution.
    if "footprint_cat" in group.columns:
        kat_counts = group["footprint_cat"].value_counts()
        kat1 = int(kat_counts.get("KAT1", 0))
        kat2 = int(kat_counts.get("KAT2", 0))
        kat3 = int(kat_counts.get("KAT3", 0))
    else:
        kat1 = kat2 = kat3 = 0

    fp_uncertain = (
        int(group["footprint_uncertain"].astype(bool).sum())
        if "footprint_uncertain" in group.columns
        else 0
    )

    return pd.Series(
        {
            "mean_velocity_mm_y": weighted_mean,
            "max_velocity_mm_y": float(group.loc[max_idx, "mean_velocity"]),
            "velocity_std": group["mean_velocity_std"].mean(),
            "point_count": len(group),
            "nearest_point_distance_m": float(group["distance_m"].min()),
            "acceleration_mean": group["acceleration"].mean(),
            "seasonality_mean": group["seasonality"].mean(),
            "_seas_median": group["seasonality"].median(),
            "_seas_std_median": group["seasonality_std"].median(),
            "artifact_point_count": artifact_count,
            "artifact_reasons": artifact_reasons,
            "kat1_count": kat1,
            "kat2_count": kat2,
            "kat3_count": kat3,
            "footprint_uncertain_count": fp_uncertain,
        }
    )
