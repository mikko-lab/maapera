"""Spatial join: EGMS InSAR points into MML building polygons.

Aggregates per-point displacement statistics into per-building summaries.
Per-building trend classification needs the full time series and is filled
in by a later pass over the Parquet output, not here.
"""

from __future__ import annotations

import geopandas as gpd
import pandas as pd

from .classify import risk_class

# Quality filters from CLAUDE.md.
MIN_COHERENCE = 0.6
MAX_VELOCITY_STD = 1.5  # mm/y
MIN_POINTS_PER_BUILDING = 3


def filter_points(points: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    """Drop EGMS points that fail coherence or velocity-std quality gates."""
    required = {"mean_velocity_std", "coherence"}
    missing = required - set(points.columns)
    if missing:
        raise ValueError(f"points missing required columns: {sorted(missing)}")
    mask = (
        (points["mean_velocity_std"] <= MAX_VELOCITY_STD)
        & (points["coherence"] >= MIN_COHERENCE)
    )
    return points.loc[mask].copy()


def aggregate_to_buildings(
    buildings: gpd.GeoDataFrame,
    points: gpd.GeoDataFrame,
    velocity_col: str = "velocity_mm_y",
) -> gpd.GeoDataFrame:
    """Spatial-join EGMS points into building polygons and compute stats.

    Both inputs MUST share CRS EPSG:3067 (meter-based, for accurate joins).
    The output adds these columns to ``buildings``:

    - ``mean_velocity_mm_y``: arithmetic mean of contained points
    - ``max_velocity_mm_y``: signed velocity of the point with greatest |v|
    - ``velocity_std``: standard deviation of contained points
    - ``point_count``: number of valid points after quality filtering
    - ``risk_class``: from ``classify.risk_class`` on |max_velocity|, or
      ``"insufficient_data"`` if ``point_count < MIN_POINTS_PER_BUILDING``
    - ``trend_class``: ``None`` here; populated later from per-point series

    The ``buildings`` frame must carry a ``building_id`` column.
    """
    if buildings.crs is None or points.crs is None:
        raise ValueError("Both inputs require an explicit CRS")
    if buildings.crs != points.crs:
        raise ValueError(f"CRS mismatch: {buildings.crs} vs {points.crs}")
    if "building_id" not in buildings.columns:
        raise ValueError("buildings must have a 'building_id' column")
    if velocity_col not in points.columns:
        raise ValueError(f"points missing velocity column '{velocity_col}'")

    valid_points = filter_points(points)
    joined = gpd.sjoin(
        valid_points,
        buildings[["building_id", "geometry"]],
        predicate="within",
        how="inner",
    )

    grouped = joined.groupby("building_id")[velocity_col].agg(
        mean_velocity_mm_y="mean",
        max_velocity_mm_y=_signed_max_abs,
        velocity_std="std",
        point_count="count",
    ).reset_index()

    out = buildings.merge(grouped, on="building_id", how="left")
    out["point_count"] = out["point_count"].fillna(0).astype(int)

    has_data = out["point_count"] >= MIN_POINTS_PER_BUILDING
    out["risk_class"] = pd.Series("insufficient_data", index=out.index, dtype=object)
    out.loc[has_data, "risk_class"] = (
        out.loc[has_data, "max_velocity_mm_y"].abs().map(risk_class)
    )
    out["trend_class"] = None

    return out


def _signed_max_abs(series: pd.Series) -> float:
    """Return the value with the largest absolute magnitude, keeping its sign."""
    if series.empty:
        return float("nan")
    idx = series.abs().idxmax()
    return float(series.loc[idx])
