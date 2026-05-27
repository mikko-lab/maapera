"""Load EGMS Ortho-Vertical InSAR points for Turku.

Two LAEA tiles (E49N42 + E50N42) cover Turku. Each CSV is ~250–500 MB
on disk after extraction, so we use Polars LazyFrame to stream-filter
on the EPSG:3035 bounding box before materialising. The output split
is intentional:

* ``metadata_gdf`` — one row per point, all scalar columns + a
  Shapely Point geometry in EPSG:3067 (TM35FIN, meter-based, ready
  for the spatial join against MML buildings).
* ``timeseries_df`` — long-format Polars DataFrame
  ``(pid, date, displacement_mm)``, easier to partition and to feed
  into the trend classifier than 118 wide columns.
"""

from __future__ import annotations

from pathlib import Path

import geopandas as gpd
import polars as pl
import pyproj
from shapely.geometry import Point

from .constants import (
    CRS_ETRS_LAEA,
    CRS_TM35FIN,
    EGMS_DIR,
    EGMS_METADATA_COLS,
    EGMS_RELEASE,
    EGMS_TURKU_TILES,
    TURKU_BBOX_3067,
)

_TS_COL_PATTERN = r"^\d{8}$"  # YYYYMMDD


def tile_csv_path(tile: str) -> Path:
    """Return the canonical path for one EGMS release/tile CSV."""
    return EGMS_DIR / f"EGMS_L3_{tile}_{EGMS_RELEASE}.csv"


def turku_bbox_in_laea() -> tuple[float, float, float, float]:
    """Project the Turku bbox from EPSG:3067 to EPSG:3035."""
    transformer = pyproj.Transformer.from_crs(
        CRS_TM35FIN, CRS_ETRS_LAEA, always_xy=True
    )
    xmin, ymin, xmax, ymax = transformer.transform_bounds(*TURKU_BBOX_3067)
    return float(xmin), float(ymin), float(xmax), float(ymax)


def load_tile(csv_path: Path) -> pl.LazyFrame:
    """Open one EGMS CSV as a Polars LazyFrame with Float32 time-series casts."""
    if not csv_path.exists():
        raise FileNotFoundError(f"EGMS tile not found: {csv_path}")
    lf = pl.scan_csv(csv_path, infer_schema_length=2000)
    ts_cols = [c for c in lf.collect_schema().names() if c.isdigit() and len(c) == 8]
    if not ts_cols:
        raise RuntimeError(f"No YYYYMMDD time-series columns found in {csv_path.name}")
    return lf.with_columns([pl.col(c).cast(pl.Float32) for c in ts_cols])


def load_turku_tiles(
    tiles: tuple[str, ...] = EGMS_TURKU_TILES,
) -> tuple[gpd.GeoDataFrame, pl.DataFrame]:
    """Load all Turku EGMS tiles, bbox-filter in EPSG:3035, return
    ``(metadata_gdf, timeseries_df)``.

    ``metadata_gdf`` is in EPSG:3067 with a Point geometry; ``timeseries_df``
    is long-format ``(pid, date, displacement_mm)`` sorted by ``(pid, date)``.
    """
    xmin, ymin, xmax, ymax = turku_bbox_in_laea()

    lazy_frames: list[pl.LazyFrame] = []
    raw_counts: dict[str, int] = {}
    for tile in tiles:
        path = tile_csv_path(tile)
        lf = load_tile(path)
        raw_counts[tile] = lf.select(pl.len()).collect().item()
        lazy_frames.append(
            lf.filter(
                pl.col("easting").is_between(xmin, xmax)
                & pl.col("northing").is_between(ymin, ymax)
            )
        )

    # Adjacent LAEA tiles can be captured on different Sentinel-1 orbit paths
    # and so carry overlapping-but-not-identical sets of YYYYMMDD columns —
    # diagonal_relaxed unions the schemas (missing dates become null).
    combined = pl.concat(lazy_frames, how="diagonal_relaxed").collect()
    print(f"EGMS raw rows: {raw_counts} (total {sum(raw_counts.values()):,})")
    print(f"After EPSG:3035 bbox filter: {len(combined):,} points")

    ts_cols = [c for c in combined.columns if c.isdigit() and len(c) == 8]
    if not ts_cols:
        raise RuntimeError("Combined frame missing YYYYMMDD time-series columns")

    metadata_pl = combined.select(list(EGMS_METADATA_COLS))
    metadata_gdf = _to_metadata_gdf(metadata_pl)

    timeseries_df = (
        combined.select(["pid", *ts_cols])
        .unpivot(
            index="pid",
            on=ts_cols,
            variable_name="date_str",
            value_name="displacement_mm",
        )
        .with_columns(
            pl.col("date_str").str.strptime(pl.Date, "%Y%m%d").alias("date"),
            pl.col("displacement_mm").cast(pl.Float32),
        )
        .drop("date_str")
        .drop_nulls("displacement_mm")
        .sort(["pid", "date"])
    )
    print(
        f"Time-series rows: {len(timeseries_df):,} "
        f"({len(ts_cols)} dates × {len(metadata_pl):,} points)"
    )
    return metadata_gdf, timeseries_df


def _to_metadata_gdf(metadata_pl: pl.DataFrame) -> gpd.GeoDataFrame:
    """Convert the scalar metadata frame to a GeoDataFrame in EPSG:3067."""
    meta_pd = metadata_pl.to_pandas()
    transformer = pyproj.Transformer.from_crs(
        CRS_ETRS_LAEA, CRS_TM35FIN, always_xy=True
    )
    xs, ys = transformer.transform(meta_pd["easting"].to_numpy(), meta_pd["northing"].to_numpy())
    geometry = gpd.points_from_xy(xs, ys, crs=CRS_TM35FIN)
    return gpd.GeoDataFrame(meta_pd, geometry=geometry, crs=CRS_TM35FIN)


if __name__ == "__main__":
    metadata_gdf, timeseries_df = load_turku_tiles()
    print("─" * 60)
    print(f"metadata: {len(metadata_gdf):,} points, CRS={metadata_gdf.crs}")
    print(f"timeseries: {len(timeseries_df):,} rows")
    print(f"date range: {timeseries_df['date'].min()} → {timeseries_df['date'].max()}")
