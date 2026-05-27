"""End-to-end ETL pipeline orchestration for one city.

Steps:
1. Load building polygons from interim parquet (must already exist —
   run ``python -m etl.src.load_mml`` first).
2. Load EGMS Ortho-Vertical InSAR points + time series.
3. Spatial-join, aggregate, classify (risk + trend).
4. Print summary stats including the demo point 30pJD7RiYA's outcome.
"""

from __future__ import annotations

import geopandas as gpd

from .constants import (
    BUILDINGS_TURKU_FGB,
    BUILDINGS_TURKU_INTERIM,
    TIMESERIES_TURKU_PARQUET,
)
from .export_fgb import export_buildings_fgb
from .export_parquet import export_timeseries_parquet
from .fetch_egms import load_turku_tiles
from .models import BuildingAggregate, EGMSPoint, PipelineConfig
from .spatial_join import (
    BUFFER_DISTANCE_M,
    MIN_POINTS_PER_BUILDING,
    aggregate_to_buildings,
    filter_points,
)

DEMO_PID = "30pJD7RiYA"  # Aurajoki rising-point demo case 1


def _print_section(title: str) -> None:
    print()
    print("=" * 60)
    print(title)
    print("=" * 60)


def run() -> gpd.GeoDataFrame:
    _print_section("0/3 Validate pipeline configuration")
    config = PipelineConfig.from_constants()
    print(f"PipelineConfig OK: {config.model_dump()}")

    _print_section("1/3 Load buildings (interim)")
    buildings = gpd.read_parquet(BUILDINGS_TURKU_INTERIM)
    print(f"Buildings loaded: {len(buildings):,}")

    _print_section("2/3 Load EGMS tiles + time series")
    metadata, timeseries = load_turku_tiles()
    print(f"EGMS raw points (after bbox): {len(metadata):,}")
    EGMSPoint.validate_dataframe(metadata)
    print("EGMSPoint schema validation: OK")
    valid_metadata = filter_points(metadata)
    print(
        f"After quality filter (mean_velocity_std < 1.5): "
        f"{len(valid_metadata):,} "
        f"(-{len(metadata) - len(valid_metadata):,})"
    )

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

    _print_section(f"Demo point {DEMO_PID}")
    demo_meta = metadata[metadata["pid"] == DEMO_PID]
    if demo_meta.empty:
        print(f"WARNING: {DEMO_PID} not found in EGMS metadata!")
    else:
        row = demo_meta.iloc[0]
        print(
            f"  pid found. mean_velocity={row['mean_velocity']:+.2f} mm/y, "
            f"std={row['mean_velocity_std']:.2f}"
        )
        passed_quality = DEMO_PID in valid_metadata["pid"].values
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
                f"  → demo point itself is not assigned to any building "
                f"(too far over the river). Checking neighbours instead:"
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
    export_buildings_fgb(out, BUILDINGS_TURKU_FGB)
    export_timeseries_parquet(
        timeseries,
        point_assignments,
        gia_baseline_mm_y=baseline,
        output_path=TIMESERIES_TURKU_PARQUET,
    )
    _spot_check_exports(out, buildings, metadata)

    return out


def _spot_check_exports(
    out: gpd.GeoDataFrame,
    buildings: gpd.GeoDataFrame,
    metadata: gpd.GeoDataFrame,
) -> None:
    """Verify the demo neighbourhood survived export to FGB + Parquet."""
    import polars as pl

    _print_section(f"Spot-check {DEMO_PID} in exported files")
    demo = metadata[metadata["pid"] == DEMO_PID].iloc[0]
    distances = buildings.geometry.distance(demo.geometry)
    nearest_bid = buildings.loc[distances.idxmin(), "building_id"]
    dist = float(distances.min())

    fgb = gpd.read_file(BUILDINGS_TURKU_FGB, where=f"building_id = '{nearest_bid}'")
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
            f"(building is {dist:.0f}m from demo pid {DEMO_PID})"
        )

    ts = (
        pl.scan_parquet(TIMESERIES_TURKU_PARQUET)
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
    run()
