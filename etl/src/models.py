"""Pydantic schemas + DataFrame validators for the ETL pipeline.

Each model documents the shape of one record at a module boundary and
ships a ``validate_dataframe`` classmethod that combines three checks:

1. **Column presence** — every required field is present in the frame.
2. **Vectorized constraints** — numeric ranges, enum membership, and
   pipeline-invariants (e.g. ``velocity_anomaly = mean - baseline``)
   are checked across *all* rows using pandas/polars expressions.
3. **Sample row instantiation** — a random sample of rows is fed
   through the Pydantic model itself, catching schema drift (e.g. a
   column silently becoming object dtype) without paying the per-row
   instantiation cost on the full frame.

Both checks fail loud (raise ``ValueError``) with a message that
identifies the offending column/row so failures surface in CI logs
rather than as silent garbage in the FGB or Parquet outputs.
"""

from __future__ import annotations

from datetime import date
from typing import Literal

import numpy as np
import pandas as pd
import polars as pl
from pydantic import BaseModel, ConfigDict, Field

# Risk thresholds (CLAUDE.md) and trend labels (classify.py) — these are the
# canonical enum values flowing through the pipeline.
RiskClass = Literal[
    "stable", "monitor", "attention", "urgent", "insufficient_data"
]
TrendClass = Literal[
    "stable", "linear", "accelerating", "decelerating", "seasonal"
]


class EGMSPoint(BaseModel):
    """One row of EGMS L3 Ortho-Vertical (metadata-only view).

    Time-series columns (``YYYYMMDD`` headers) live in a separate long
    frame; only scalar metadata is modelled here.
    """

    model_config = ConfigDict(extra="ignore")

    pid: str = Field(..., min_length=1)
    easting: float = Field(..., ge=2_000_000.0, le=7_000_000.0)   # EPSG:3035
    northing: float = Field(..., ge=1_000_000.0, le=6_000_000.0)  # EPSG:3035
    height_ortho: float | None = None
    rmse_ts: float | None = Field(None, ge=0.0)
    # Raw EGMS can carry extreme values from active excavation sites or
    # phase-unwrapping artefacts. We only reject obvious sentinel garbage
    # here; physical plausibility (±50 mm/y) is enforced in
    # spatial_join.filter_points before any building aggregation.
    mean_velocity: float = Field(..., ge=-500.0, le=500.0)        # mm/y
    mean_velocity_std: float = Field(..., ge=0.0, le=20.0)        # mm/y
    acceleration: float | None = None
    acceleration_std: float | None = Field(None, ge=0.0)
    seasonality: float | None = None
    seasonality_std: float | None = Field(None, ge=0.0)
    gnss_velocity_n: float | None = None
    gnss_velocity_e: float | None = None
    gnss_velocity_u: float | None = None

    @classmethod
    def validate_dataframe(
        cls, df: pd.DataFrame, *, sample_size: int = 50
    ) -> None:
        _require_columns(df, ("pid", "easting", "northing", "mean_velocity",
                              "mean_velocity_std"), context="EGMSPoint")
        _check_range(df, "mean_velocity", -500.0, 500.0, context="EGMSPoint")
        _check_range(df, "mean_velocity_std", 0.0, 20.0, context="EGMSPoint")
        if df["pid"].astype(str).str.len().eq(0).any():
            raise ValueError("EGMSPoint: empty pid found")
        _sample_validate(df, cls, sample_size)


class BuildingAggregate(BaseModel):
    """One row of ``spatial_join.aggregate_to_buildings`` output.

    Aggregated metrics may be NaN for buildings classified as
    ``insufficient_data`` (no EGMS point within the 75 m buffer).
    """

    model_config = ConfigDict(extra="ignore")

    building_id: str = Field(..., min_length=1)
    mean_velocity_mm_y: float | None = Field(None, ge=-100.0, le=100.0)
    max_velocity_mm_y: float | None = Field(None, ge=-100.0, le=100.0)
    velocity_std: float | None = Field(None, ge=0.0, le=20.0)
    point_count: int = Field(..., ge=0)
    nearest_point_distance_m: float | None = Field(None, ge=0.0)
    gia_baseline_mm_y: float = Field(..., ge=-5.0, le=15.0)
    velocity_anomaly_mm_y: float | None = Field(None, ge=-100.0, le=100.0)
    risk_class: RiskClass
    anomaly_class: RiskClass
    trend_class: TrendClass | None = None
    trend_class_anomaly: TrendClass | None = None
    regional_motion_flag: bool = False
    driving_point_rmse: float | None = Field(None, ge=0.0)
    kayttotarkoitus: int | None = None
    kerrosluku: int | None = None
    area_m2: float = Field(..., gt=0.0)

    @classmethod
    def validate_dataframe(
        cls, df: pd.DataFrame, *, sample_size: int = 50
    ) -> None:
        required = (
            "building_id", "point_count", "gia_baseline_mm_y",
            "risk_class", "anomaly_class", "area_m2",
        )
        _require_columns(df, required, context="BuildingAggregate")
        _check_range(df, "gia_baseline_mm_y", -5.0, 15.0,
                     context="BuildingAggregate")
        _check_range(df, "area_m2", 0.0, np.inf,
                     context="BuildingAggregate", strict_low=True)
        if (df["point_count"] < 0).any():
            raise ValueError("BuildingAggregate: negative point_count")
        _check_enum(df, "risk_class",
                    {"stable", "monitor", "attention", "urgent",
                     "insufficient_data"},
                    context="BuildingAggregate")
        _check_enum(df, "anomaly_class",
                    {"stable", "monitor", "attention", "urgent",
                     "insufficient_data"},
                    context="BuildingAggregate")

        # Pipeline invariant: velocity_anomaly = mean_velocity − gia_baseline
        has_both = (
            df["velocity_anomaly_mm_y"].notna()
            & df["mean_velocity_mm_y"].notna()
        )
        if has_both.any():
            expected = (
                df.loc[has_both, "mean_velocity_mm_y"]
                - df.loc[has_both, "gia_baseline_mm_y"]
            )
            actual = df.loc[has_both, "velocity_anomaly_mm_y"]
            if not np.allclose(expected, actual, atol=1e-4, equal_nan=True):
                raise ValueError(
                    "BuildingAggregate: velocity_anomaly_mm_y does not equal "
                    "mean_velocity_mm_y − gia_baseline_mm_y"
                )

        _sample_validate(df, cls, sample_size)


class TimeseriesRecord(BaseModel):
    """One row of the per-building displacement Parquet."""

    model_config = ConfigDict(extra="ignore")

    building_id: str = Field(..., min_length=1)
    pid: str = Field(..., min_length=1)
    date: date
    displacement_mm: float = Field(..., ge=-1000.0, le=1000.0)
    displacement_anomaly_mm: float = Field(..., ge=-1000.0, le=1000.0)

    @classmethod
    def validate_dataframe(
        cls, df: pl.DataFrame, *, sample_size: int = 50
    ) -> None:
        required = ("building_id", "pid", "date",
                    "displacement_mm", "displacement_anomaly_mm")
        missing = [c for c in required if c not in df.columns]
        if missing:
            raise ValueError(
                f"TimeseriesRecord: missing columns {missing}"
            )
        for col in ("displacement_mm", "displacement_anomaly_mm"):
            bounds = df.select(
                pl.col(col).min().alias("lo"),
                pl.col(col).max().alias("hi"),
            ).row(0)
            lo, hi = bounds
            if lo is not None and (lo < -1000.0 or hi > 1000.0):
                raise ValueError(
                    f"TimeseriesRecord: {col} out of [-1000, 1000]: "
                    f"observed [{lo}, {hi}]"
                )
        if df.select((pl.col("building_id").str.len_chars() == 0).any()).item():
            raise ValueError("TimeseriesRecord: empty building_id found")

        # Sample-validate by converting a small slice to pandas dicts.
        n = min(sample_size, len(df))
        if n == 0:
            return
        sample_pd = df.head(n).to_pandas()
        for idx, row in sample_pd.iterrows():
            try:
                cls(**{k: row[k] for k in cls.model_fields})
            except Exception as e:
                raise ValueError(
                    f"TimeseriesRecord row {idx}: {e}"
                ) from e


class PipelineConfig(BaseModel):
    """Frozen, validated wrapper around the scalar tunables in ``constants``.

    Built once at pipeline start; any out-of-range constant fails the
    whole run before EGMS data is even touched.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    gia_baseline_turku_mm_y: float = Field(..., ge=-5.0, le=15.0)
    buffer_distance_m: float = Field(..., gt=0.0, le=200.0)
    distance_weight_falloff_m: float = Field(..., gt=0.0, le=100.0)
    min_points_per_building: int = Field(..., ge=1)
    min_building_area_m2: float = Field(..., gt=0.0)
    max_velocity_std: float = Field(..., gt=0.0, le=20.0)
    excluded_kayttotarkoitus: frozenset[int]

    @classmethod
    def from_constants(cls) -> "PipelineConfig":
        # Imported lazily to avoid circular import (constants.py is a leaf).
        from . import constants as c
        from .spatial_join import (
            BUFFER_DISTANCE_M,
            DISTANCE_WEIGHT_FALLOFF_M,
            MAX_VELOCITY_STD,
            MIN_POINTS_PER_BUILDING,
        )

        return cls(
            gia_baseline_turku_mm_y=c.GIA_BASELINE_TURKU_MM_Y,
            buffer_distance_m=BUFFER_DISTANCE_M,
            distance_weight_falloff_m=DISTANCE_WEIGHT_FALLOFF_M,
            min_points_per_building=MIN_POINTS_PER_BUILDING,
            min_building_area_m2=c.MIN_BUILDING_AREA_M2,
            max_velocity_std=MAX_VELOCITY_STD,
            excluded_kayttotarkoitus=c.EXCLUDED_KAYTTOTARKOITUS_CODES,
        )


# ---------------------------------------------------------------------------
# Vectorised constraint helpers (shared by the validators above).
# ---------------------------------------------------------------------------


def _require_columns(
    df: pd.DataFrame, cols: tuple[str, ...], *, context: str
) -> None:
    missing = [c for c in cols if c not in df.columns]
    if missing:
        raise ValueError(f"{context}: missing required columns {missing}")


def _check_range(
    df: pd.DataFrame,
    col: str,
    lo: float,
    hi: float,
    *,
    context: str,
    strict_low: bool = False,
) -> None:
    series = df[col].dropna()
    if series.empty:
        return
    too_low = (series <= lo) if strict_low else (series < lo)
    too_high = series > hi
    bad = (too_low | too_high).sum()
    if bad:
        observed_lo = float(series.min())
        observed_hi = float(series.max())
        raise ValueError(
            f"{context}: {bad} rows of '{col}' outside "
            f"{'(' if strict_low else '['}{lo}, {hi}] — "
            f"observed [{observed_lo}, {observed_hi}]"
        )


def _check_enum(
    df: pd.DataFrame, col: str, valid: set[str], *, context: str
) -> None:
    bad_mask = ~df[col].isin(valid)
    if bad_mask.any():
        unique_bad = sorted(set(df.loc[bad_mask, col].astype(str).unique()))
        raise ValueError(
            f"{context}: '{col}' has invalid values {unique_bad}; "
            f"expected one of {sorted(valid)}"
        )


def _sample_validate(
    df: pd.DataFrame, model: type[BaseModel], sample_size: int
) -> None:
    """Instantiate ``model`` for a random sample of rows, raising on schema drift.

    ``NaN`` cells are skipped (not passed as ``None``) because float
    columns silently re-coerce ``None`` back to ``NaN``; Pydantic then
    fails the ``ge/le`` checks on the NaN value. Skipping lets the
    Optional defaults handle missing values cleanly.
    """
    n = min(sample_size, len(df))
    if n == 0:
        return
    sample = df.sample(n, random_state=42)
    fields = list(model.model_fields)
    for idx, row in sample.iterrows():
        payload = {
            k: row[k]
            for k in fields
            if k in row.index and not pd.isna(row[k])
        }
        try:
            model(**payload)
        except Exception as e:
            raise ValueError(f"{model.__name__} row {idx}: {e}") from e


