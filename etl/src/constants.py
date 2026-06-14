"""Project-wide constants for the ETL pipeline."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

ETL_ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ETL_ROOT / "data"
RAW_DIR = DATA_DIR / "raw"
INTERIM_DIR = DATA_DIR / "interim"
PROCESSED_DIR = DATA_DIR / "processed"

MML_RAKENNUS_LAYER = "rakennus"

# EGMS — release 2020–2024 (acquisition window; actual data starts 2021-06-07).
EGMS_DIR = RAW_DIR / "egms"
EGMS_RELEASE = "U_2020_2024_1"
EGMS_METADATA_COLS = (
    "pid", "easting", "northing", "height_ortho", "rmse_ts",
    "mean_velocity", "mean_velocity_std",
    "acceleration", "acceleration_std",
    "seasonality", "seasonality_std",
    "gnss_velocity_n", "gnss_velocity_e", "gnss_velocity_u",
)

CRS_TM35FIN = "EPSG:3067"
CRS_WGS84 = "EPSG:4326"
CRS_ETRS_LAEA = "EPSG:3035"

# Building-relevance filters applied after geometry repair, before write.
# MTK's `kayttotarkoitus` is a 1-digit code (NOT the 4-digit RKL/VTJ scheme):
#   1 asuinrakennus | 2 liikerakennus | 3 toimisto/liike |
#   5 hoitoala     | 6 talousrakennus (≈ kohdeluokka 42261, vajat/katokset)
#   8 teollisuus
# Code 6 dominates the outbuilding noise in Turku (~18k features, 40 m² median)
# and is excluded so PDF reports focus on substantive structures.
EXCLUDED_KAYTTOTARKOITUS_CODES = frozenset({6})
MIN_BUILDING_AREA_M2 = 30.0


@dataclass(frozen=True)
class CityConfig:
    """Per-city pipeline configuration."""
    name: str
    municipality_code: str
    bbox_3067: tuple[float, float, float, float]
    egms_tiles: tuple[str, ...]
    mml_gpkg: Path
    buildings_interim: Path
    buildings_fgb: Path
    timeseries_parquet: Path


TURKU = CityConfig(
    name="turku",
    municipality_code="853",
    # Generous bbox in EPSG:3067 covering all of Turku municipality.
    bbox_3067=(220_000.0, 6_695_000.0, 260_000.0, 6_730_000.0),
    egms_tiles=("E49N42_100km", "E50N42_100km"),
    mml_gpkg=RAW_DIR / "mml" / "rakennukset_Turku.gpkg",
    buildings_interim=INTERIM_DIR / "buildings_turku.parquet",
    buildings_fgb=PROCESSED_DIR / "buildings_turku.fgb",
    timeseries_parquet=PROCESSED_DIR / "timeseries_turku.parquet",
)

HELSINKI = CityConfig(
    name="helsinki",
    municipality_code="091",
    # Generous bbox in EPSG:3067 covering Helsinki municipality.
    bbox_3067=(355_000.0, 6_656_000.0, 432_000.0, 6_700_000.0),
    egms_tiles=("E51N42_100km",),
    mml_gpkg=RAW_DIR / "mml" / "rakennukset_Helsinki.gpkg",
    buildings_interim=INTERIM_DIR / "buildings_helsinki.parquet",
    buildings_fgb=PROCESSED_DIR / "buildings_helsinki.fgb",
    timeseries_parquet=PROCESSED_DIR / "timeseries_helsinki.parquet",
)

CITIES: dict[str, CityConfig] = {"turku": TURKU, "helsinki": HELSINKI}

# ---------------------------------------------------------------------------
# Legacy aliases — keep existing imports working without changes.
# ---------------------------------------------------------------------------
MML_TURKU_GPKG = TURKU.mml_gpkg
EGMS_TURKU_TILES = TURKU.egms_tiles
TURKU_MUNICIPALITY_CODE = TURKU.municipality_code
TURKU_BBOX_3067 = TURKU.bbox_3067
BUILDINGS_TURKU_INTERIM = TURKU.buildings_interim
BUILDINGS_TURKU_FGB = TURKU.buildings_fgb
TIMESERIES_TURKU_PARQUET = TURKU.timeseries_parquet
# GIA fallback — data-driven median used at runtime; this is the sanity-check value.
# TODO: NKG2016LU per-coordinate lookup (Lehtonen et al., NLS).
GIA_BASELINE_TURKU_MM_Y = 5.0
