"""Load MML Maastotietokanta rakennus (building polygons) for Turku.

Reads the Turku-clipped GeoPackage (already filtered to municipality 853
by MML's order service), clips to a generous Turku bounding box for
performance, repairs invalid polygons with ``buffer(0)``, and writes a
clean GeoParquet to the interim directory. The script is idempotent and
prints summary stats.
"""

from __future__ import annotations

import sys
from pathlib import Path

import geopandas as gpd

from .constants import (
    BUILDINGS_TURKU_INTERIM,
    CRS_TM35FIN,
    EXCLUDED_KAYTTOTARKOITUS_CODES,
    MIN_BUILDING_AREA_M2,
    MML_RAKENNUS_LAYER,
    MML_TURKU_GPKG,
    TURKU_BBOX_3067,
    TURKU_MUNICIPALITY_CODE,
)

# MML has used several names for the municipality-code field over the years.
# The Turku-clipped order-service export omits the field entirely (rows are
# already filtered), so the check is best-effort.
MUNICIPALITY_CODE_CANDIDATES = ("kuntakoodi", "kuntatunnus", "kunta")


def load_turku_buildings(
    source: Path = MML_TURKU_GPKG,
    layer: str = MML_RAKENNUS_LAYER,
    output: Path = BUILDINGS_TURKU_INTERIM,
) -> gpd.GeoDataFrame:
    if not source.exists():
        raise FileNotFoundError(
            f"MML file not found: {source}\n"
            "Order the Turku-clipped Maastotietokanta extract from "
            "Maanmittauslaitos and place it at the path above."
        )

    # bbox pre-filter pushes the spatial filter down to OGR — much faster
    # than reading the whole file and filtering in memory.
    gdf = gpd.read_file(source, layer=layer, bbox=TURKU_BBOX_3067)
    print(f"Loaded {len(gdf):,} features from {source.name} layer={layer}")
    print(f"Columns: {list(gdf.columns)}")

    if gdf.crs is None:
        raise RuntimeError("Source has no CRS defined; cannot project safely")
    if str(gdf.crs).upper() != CRS_TM35FIN:
        print(f"Reprojecting from {gdf.crs} to {CRS_TM35FIN}")
        gdf = gdf.to_crs(CRS_TM35FIN)

    code_field = next(
        (c for c in MUNICIPALITY_CODE_CANDIDATES if c in gdf.columns),
        None,
    )
    if code_field is not None:
        gdf[code_field] = gdf[code_field].astype(str)
        gdf = gdf[gdf[code_field] == TURKU_MUNICIPALITY_CODE].copy()
        print(
            f"Filtered to Turku ({code_field}={TURKU_MUNICIPALITY_CODE}): "
            f"{len(gdf):,} features"
        )
    else:
        print(
            f"No municipality-code column ({MUNICIPALITY_CODE_CANDIDATES}); "
            "trusting source extract is already Turku-clipped."
        )

    invalid = ~gdf.geometry.is_valid
    if invalid.any():
        print(f"Fixing {int(invalid.sum())} invalid geometries with buffer(0)")
        gdf.loc[invalid, "geometry"] = gdf.loc[invalid, "geometry"].buffer(0)
    gdf = gdf[gdf.geometry.is_valid & ~gdf.geometry.is_empty].copy()

    before = len(gdf)
    if "kayttotarkoitus" in gdf.columns and EXCLUDED_KAYTTOTARKOITUS_CODES:
        gdf = gdf[~gdf["kayttotarkoitus"].isin(EXCLUDED_KAYTTOTARKOITUS_CODES)].copy()
        print(
            f"Excluded kayttotarkoitus {sorted(EXCLUDED_KAYTTOTARKOITUS_CODES)}: "
            f"{before:,} → {len(gdf):,} (-{before - len(gdf):,})"
        )

    before = len(gdf)
    gdf["area_m2"] = gdf.geometry.area
    gdf = gdf[gdf["area_m2"] >= MIN_BUILDING_AREA_M2].copy()
    print(
        f"Area filter ≥ {MIN_BUILDING_AREA_M2:g} m²: "
        f"{before:,} → {len(gdf):,} (-{before - len(gdf):,})"
    )

    # Canonicalise the ID column: use `building_id` everywhere downstream,
    # keep `mtk_id` as a provenance field (future cities may not come from MTK).
    gdf["building_id"] = gdf["mtk_id"].astype(str)

    bounds = gdf.total_bounds
    total_area_km2 = float(gdf.geometry.area.sum()) / 1e6
    print("─" * 60)
    print(f"Buildings:    {len(gdf):,}")
    print(f"Total area:   {total_area_km2:,.2f} km²")
    print(f"CRS:          {gdf.crs}")
    print(
        f"BBOX (E,N):   {bounds[0]:,.0f} {bounds[1]:,.0f} → "
        f"{bounds[2]:,.0f} {bounds[3]:,.0f}"
    )
    print("─" * 60)

    output.parent.mkdir(parents=True, exist_ok=True)
    gdf.to_parquet(output)
    print(f"Wrote {output}")
    return gdf


if __name__ == "__main__":
    try:
        load_turku_buildings()
    except FileNotFoundError as e:
        print(e, file=sys.stderr)
        sys.exit(1)
