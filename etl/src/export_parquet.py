"""Export per-building InSAR time series as a Parquet file.

Each row is one EGMS displacement reading attributed to one building.
A single EGMS pid can map to multiple buildings (via the 75 m buffer
in spatial_join), so rows are duplicated by ``(pid, building_id)``.

``displacement_anomaly_mm`` removes the cumulative GIA contribution
(``gia_baseline_mm_y · years_since_pid_start``) so chart libraries can
plot building-specific motion directly without re-detrending.
"""

from __future__ import annotations

from pathlib import Path

import pandas as pd
import polars as pl

from .constants import TIMESERIES_TURKU_PARQUET
from .models import TimeseriesRecord


def export_timeseries_parquet(
    timeseries: pl.DataFrame,
    point_assignments: pd.DataFrame,
    gia_baseline_mm_y: float,
    output_path: Path = TIMESERIES_TURKU_PARQUET,
) -> Path:
    """Join (pid, date, displacement) with point→building mapping; detrend; write.

    Parameters
    ----------
    timeseries
        Long-format Polars frame with columns ``pid``, ``date``,
        ``displacement_mm`` (as produced by ``fetch_egms.load_turku_tiles``).
    point_assignments
        Pandas frame with at minimum ``pid`` and ``building_id`` (the
        second element of ``spatial_join.aggregate_to_buildings``'s
        return tuple).
    gia_baseline_mm_y
        Regional GIA baseline velocity used to compute the anomaly.
    """
    mapping = pl.from_pandas(
        point_assignments[["pid", "building_id"]].drop_duplicates()
    )

    joined = (
        timeseries.join(mapping, on="pid", how="inner")
        .sort(["pid", "date"])
        .with_columns(
            pl.col("date").min().over("pid").alias("_pid_start"),
        )
        .with_columns(
            (
                (pl.col("date") - pl.col("_pid_start")).dt.total_days() / 365.25
            ).alias("_years_since_start")
        )
        .with_columns(
            (
                pl.col("displacement_mm")
                - pl.lit(gia_baseline_mm_y) * pl.col("_years_since_start")
            )
            .cast(pl.Float32)
            .alias("displacement_anomaly_mm")
        )
        .select(
            pl.col("building_id").cast(pl.Utf8),
            pl.col("pid").cast(pl.Utf8),
            pl.col("date"),
            pl.col("displacement_mm").cast(pl.Float32),
            pl.col("displacement_anomaly_mm"),
        )
        .sort(["building_id", "pid", "date"])
    )

    TimeseriesRecord.validate_dataframe(joined)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    # Snappy (instead of zstd) so hyparquet decodes it in the browser
    # without pulling a separate WASM decompressor. ~10–15 % larger file
    # in exchange for a noticeably smaller client bundle.
    joined.write_parquet(
        output_path,
        compression="snappy",
    )

    size_mb = output_path.stat().st_size / 1_048_576
    print(
        f"Wrote {output_path.name}: {len(joined):,} rows, "
        f"{joined['building_id'].n_unique():,} buildings, "
        f"{joined['pid'].n_unique():,} pids, {size_mb:.1f} MB"
    )
    return output_path
