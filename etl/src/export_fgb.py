"""Export aggregated building polygons to FlatGeobuf for the frontend.

FlatGeobuf is a single-file binary format with an HTTP Range-request
spatial index, so the web client can bbox-fetch just the buildings in
view without loading the whole file. We reproject EPSG:3067 → EPSG:4326
because MapLibre/deck.gl expect WGS84 by default.

Insufficient-data buildings are intentionally retained (with
``anomaly_class='insufficient_data'``) so users can see coverage gaps
rather than silently shrinking the building stock.
"""

from __future__ import annotations

from pathlib import Path

import geopandas as gpd

from .constants import BUILDINGS_TURKU_FGB, CRS_WGS84

# Column selection + renaming for the FGB. Order is the output column order.
# Keys are source columns from spatial_join.aggregate_to_buildings output;
# values are FGB column names (None = keep source name).
_FGB_COLUMNS: dict[str, str | None] = {
    "building_id": None,
    "mean_velocity_mm_y": None,        # raw, audit
    "velocity_anomaly_mm_y": None,     # headline number
    "gia_baseline_mm_y": None,         # methodology / "we know what we're doing"
    "risk_class": None,                # absolute, audit trail
    "anomaly_class": None,             # user-facing classification
    "trend_class_anomaly": None,       # user-facing trend
    "trend_class": "trend_class_absolute",  # rename: audit trend
    "point_count": None,
    "nearest_point_distance_m": None,
    "velocity_std": None,              # uncertainty proxy
    "kayttotarkoitus": None,           # frontend filter (residential etc.)
    "kerrosluku": None,                # sales targeting (floors)
    "area_m2": "footprint_area_m2",   # rename: be explicit it's footprint
    # Quality / artefact flags — always present, drive report warnings.
    "has_artifact_flag": None,         # True if any point flagged for cycle-slip
    "artifact_reasons": None,          # pipe-separated flag reasons for report
    "risk_class_uncertain": None,      # True if artefact OR all data outside footprint
    "regional_motion_flag": None,      # True if elevated class was demoted (KAT3-only)
    "driving_point_rmse": None,        # linear-regression RMSE of driving point (mm); proxy for baseline-slip
    "kat1_count": None,                # points inside footprint, clearly interior
    "kat2_count": None,                # points inside footprint, near edge/ground
    "kat3_count": None,                # points outside footprint (parking/fill)
}


def export_buildings_fgb(
    buildings: gpd.GeoDataFrame,
    output_path: Path = BUILDINGS_TURKU_FGB,
) -> Path:
    """Select columns, reproject to WGS84, write FlatGeobuf with spatial index."""
    missing = [c for c in _FGB_COLUMNS if c not in buildings.columns]
    if missing:
        raise ValueError(f"buildings missing expected columns: {missing}")

    rename_map = {src: dst for src, dst in _FGB_COLUMNS.items() if dst is not None}
    out = (
        buildings[list(_FGB_COLUMNS) + ["geometry"]]
        .rename(columns=rename_map)
        .to_crs(CRS_WGS84)
    )

    # Cast small ints to int32 for compact FGB encoding; nullable types from
    # pandas become FGB nullable fields automatically via pyogrio.
    for col in ("point_count", "kayttotarkoitus", "kerrosluku"):
        if col in out.columns:
            out[col] = out[col].astype("Int32")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    out.to_file(output_path, driver="FlatGeobuf", spatial_index=True)

    size_mb = output_path.stat().st_size / 1_048_576
    print(
        f"Wrote {output_path.name}: {len(out):,} buildings, "
        f"{size_mb:.1f} MB, CRS={out.crs.to_string()}"
    )
    return output_path
