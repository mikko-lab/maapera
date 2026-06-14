"""End-to-end ETL pipeline orchestration for one city.

Steps:
1. Load building polygons from interim parquet (must already exist —
   run ``python -m etl.src.load_mml --city <city>`` first).
2. Load EGMS Ortho-Vertical InSAR points + time series.
3. Spatial-join, aggregate, classify (risk + trend).
4. Print summary stats.

Usage:
  python -m etl.src.run_pipeline              # Turku (default)
  python -m etl.src.run_pipeline --city helsinki
"""

from __future__ import annotations

import argparse

import geopandas as gpd

from .constants import CITIES, TURKU, CityConfig
from .export_fgb import export_buildings_fgb
from .export_parquet import export_timeseries_parquet
from .fetch_egms import load_tiles
from .models import BuildingAggregate, EGMSPoint, PipelineConfig
from .spatial_join import (
    BUFFER_DISTANCE_M,
    MIN_POINTS_PER_BUILDING,
    aggregate_to_buildings,
    filter_points,
)

DEMO_PIDS: dict[str, str] = {
    "turku": "30pJD7RiYA",    # Aurajoki rising-point demo case 1
    "helsinki": "30pKwwkMPv",  # Verkkosaari fast subsidence
}


def _print_section(title: str) -> None:
    print()
    print("=" * 60)
    print(title)
    print("=" * 60)


def run(city: CityConfig = TURKU) -> gpd.GeoDataFrame:
    _print_section(f"0/3 Validate pipeline configuration [{city.name.upper()}]")
    config = PipelineConfig.from_constants()
    print(f"PipelineConfig OK: {config.model_dump()}")

    _print_section("1/3 Load buildings (interim)")
    if not city.buildings_interim.exists():
        raise FileNotFoundError(
            f"{city.buildings_interim} not found — run: "
            f"python -m etl.src.load_mml --city {city.name}"
        )
    buildings = gpd.read_parquet(city.buildings_interim)
    print(f"Buildings loaded: {len(buildings):,}")

    _print_section("2/3 Load EGMS tiles + time series")
    metadata, timeseries = load_tiles(city)
    print(f"EGMS raw points (after bbox): {len(metadata):,}")
    valid_metadata = filter_points(metadata)
    print(
        f"After quality filter (mean_velocity_std < 1.5): "
        f"{len(valid_metadata):,} "
        f"(-{len(metadata) - len(valid_metadata):,})"
    )
    EGMSPoint.validate_dataframe(valid_metadata)
    print("EGMSPoint schema validation: OK")

    _print_section("3/3 Spatial join + classify")
    baseline = float(valid_metadata["mean_velocity"].median())
    print(
        f"Regional GIA baseline (median of {len(valid_metadata):,} valid points): "
        f"{baseline:+.2f} mm/y — used for velocity_anomaly_mm_y"
    )
    out, point_assignments = aggregate_to_buildings(
        buildings,
        metadata,
        timeseries=timeseries,
        regional_baseline_mm_y=baseline,
    )
    BuildingAggregate.validate_dataframe(out)
    print("BuildingAggregate constraints + sample: OK")

    has_data = out["point_count"] >= MIN_POINTS_PER_BUILDING
    print(
        f"Buildings with ≥{MIN_POINTS_PER_BUILDING} EGMS points: "
        f"{int(has_data.sum()):,} / {len(out):,} "
        f"({has_data.mean() * 100:.1f} %)"
    )

    _print_section("Risk class distribution (absolute velocity)")
    print(out["risk_class"].value_counts(dropna=False).to_string())

    if "anomaly_class" in out.columns:
        _print_section(f"Anomaly class distribution (Δ from {baseline:+.2f} mm/y)")
        print(out["anomaly_class"].value_counts(dropna=False).to_string())

    _print_section("Trend class — raw displacement")
    print(out["trend_class"].value_counts(dropna=False).to_string())

    if "trend_class_anomaly" in out.columns and out["trend_class_anomaly"].notna().any():
        _print_section("Trend class — anomaly (raw − GIA baseline · years)")
        print(out["trend_class_anomaly"].value_counts(dropna=False).to_string())

    demo_pid = DEMO_PIDS.get(city.name, "")
    _print_section(f"Demo point {demo_pid}")
    demo_meta = metadata[metadata["pid"] == demo_pid] if demo_pid else metadata.iloc[:0]
    if demo_meta.empty:
        print(f"WARNING: {demo_pid} not found in EGMS metadata — skipping demo")
    else:
        row = demo_meta.iloc[0]
        print(
            f"  pid found. mean_velocity={row['mean_velocity']:+.2f} mm/y, "
            f"std={row['mean_velocity_std']:.2f}"
        )
        passed_quality = demo_pid in valid_metadata["pid"].values
        print(f"  passed quality filter: {passed_quality}")
        demo_point = demo_meta.geometry.iloc[0]
        # With buffer 75 m sjoin, the demo point is "assigned" to every
        # building whose buffered polygon contains it (i.e. polygon edge
        # within BUFFER_DISTANCE_M of the point).
        distances = buildings.geometry.distance(demo_point)
        within_buffer = buildings.loc[distances <= BUFFER_DISTANCE_M].copy()
        within_buffer["dist_m"] = distances.loc[within_buffer.index]
        nearest_dist = float(distances.min())
        print(
            f"  nearest building edge: {nearest_dist:.0f} m  "
            f"(buffer threshold: {BUFFER_DISTANCE_M:g} m)"
        )
        if within_buffer.empty:
            print(
                f"  → demo point not assigned to any building within buffer. "
                f"Checking nearest neighbours:"
            )
            nearest = buildings.assign(dist_m=distances).nsmallest(3, "dist_m")
            for _, b in nearest.iterrows():
                agg = out[out["building_id"] == b["building_id"]].iloc[0]
                anomaly_bits = (
                    f" anomaly={agg['velocity_anomaly_mm_y']:+.2f} "
                    f"→ {agg['anomaly_class']!r}"
                    if "anomaly_class" in agg.index
                    else ""
                )
                print(
                    f"    nbr {b['building_id']} @ {b['dist_m']:.0f} m: "
                    f"pts={int(agg['point_count'])}, "
                    f"mean={agg['mean_velocity_mm_y']:+.2f}, "
                    f"max={agg['max_velocity_mm_y']:+.2f}, "
                    f"nearest_pt={agg['nearest_point_distance_m']:.0f}m → "
                    f"risk={agg['risk_class']!r}{anomaly_bits}"
                )
        else:
            print(
                f"  → assigned to {len(within_buffer)} building(s) within buffer:"
            )
            for _, b in within_buffer.nsmallest(5, "dist_m").iterrows():
                agg = out[out["building_id"] == b["building_id"]].iloc[0]
                print(
                    f"    {b['building_id']} @ {b['dist_m']:.0f} m: "
                    f"pts={int(agg['point_count'])}, "
                    f"mean={agg['mean_velocity_mm_y']:+.2f}, "
                    f"max={agg['max_velocity_mm_y']:+.2f}, "
                    f"risk={agg['risk_class']!r}, "
                    f"trend={agg['trend_class']!r}"
                )

    _print_section("Nearest-point-distance distribution (classified buildings)")
    classified = out[out["point_count"] >= MIN_POINTS_PER_BUILDING]
    npd = classified["nearest_point_distance_m"]
    print(
        f"  count={len(classified):,}  "
        f"median={npd.median():.0f}m  "
        f"p90={npd.quantile(0.9):.0f}m  "
        f"max={npd.max():.0f}m"
    )

    _print_section("Export → FlatGeobuf + Parquet")
    export_buildings_fgb(out, city.buildings_fgb)
    export_timeseries_parquet(
        timeseries,
        point_assignments,
        gia_baseline_mm_y=baseline,
        output_path=city.timeseries_parquet,
    )
    _spot_check_exports(out, buildings, metadata, city)

    return out


def _spot_check_exports(
    out: gpd.GeoDataFrame,
    buildings: gpd.GeoDataFrame,
    metadata: gpd.GeoDataFrame,
    city: CityConfig = TURKU,
) -> None:
    """Verify the demo neighbourhood survived export to FGB + Parquet."""
    import polars as pl

    demo_pid = DEMO_PIDS.get(city.name, "")
    if not demo_pid or demo_pid not in metadata["pid"].values:
        return
    _print_section(f"Spot-check {demo_pid} in exported files")
    demo = metadata[metadata["pid"] == demo_pid].iloc[0]
    distances = buildings.geometry.distance(demo.geometry)
    nearest_bid = buildings.loc[distances.idxmin(), "building_id"]
    dist = float(distances.min())

    fgb = gpd.read_file(city.buildings_fgb, where=f"building_id = '{nearest_bid}'")
    if fgb.empty:
        print(f"  FGB MISSING building_id={nearest_bid!r} — investigate")
    else:
        row = fgb.iloc[0]
        print(
            f"  FGB hit: building_id={row['building_id']}, "
            f"anomaly_class={row['anomaly_class']!r}, "
            f"trend_class_anomaly={row['trend_class_anomaly']!r}, "
            f"velocity_anomaly={row['velocity_anomaly_mm_y']:+.2f}, "
            f"nearest_pt={row['nearest_point_distance_m']:.0f}m "
            f"(building is {dist:.0f}m from demo pid {demo_pid})"
        )

    ts = (
        pl.scan_parquet(city.timeseries_parquet)
        .filter(pl.col("building_id") == nearest_bid)
        .collect()
    )
    if ts.is_empty():
        print(f"  Parquet MISSING building_id={nearest_bid!r} — investigate")
    else:
        d_min, d_max = ts["date"].min(), ts["date"].max()
        print(
            f"  Parquet hit: {len(ts):,} rows across "
            f"{ts['pid'].n_unique()} pids, dates {d_min} → {d_max}"
        )


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--city", choices=list(CITIES), default="turku")
    args = parser.parse_args()
    run(CITIES[args.city])
