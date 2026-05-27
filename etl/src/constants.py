"""Project-wide constants for the ETL pipeline."""

from pathlib import Path

ETL_ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ETL_ROOT / "data"
RAW_DIR = DATA_DIR / "raw"
INTERIM_DIR = DATA_DIR / "interim"
PROCESSED_DIR = DATA_DIR / "processed"

MML_TURKU_GPKG = RAW_DIR / "mml" / "rakennukset_Turku.gpkg"
MML_RAKENNUS_LAYER = "rakennus"

# EGMS — release 2020–2024 (acquisition window; actual data starts 2021-06-07).
EGMS_DIR = RAW_DIR / "egms"
EGMS_RELEASE = "U_2020_2024_1"
EGMS_TURKU_TILES = ("E49N42_100km", "E50N42_100km")
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

TURKU_MUNICIPALITY_CODE = "853"
# Generous bbox in EPSG:3067 covering all of Turku municipality.
TURKU_BBOX_3067 = (220_000.0, 6_695_000.0, 260_000.0, 6_730_000.0)

# Regional GIA (glacial isostatic adjustment / postglacial rebound) baseline.
# Finland rises ~5 mm/y absolutely; subtracting this from EGMS Vertical velocity
# gives the building-specific anomaly used in risk reporting. The actual value
# fed to the ETL is the data-driven regional median (currently ~4.9 mm/y) — this
# constant is the documented MVP fallback / sanity check.
# TODO: Day 7+ — replace with NKG2016LU absolute land-uplift model lookup per
# coordinate (Lehtonen et al., NLS).
GIA_BASELINE_TURKU_MM_Y = 5.0

# Building-relevance filters applied after geometry repair, before write.
# MTK's `kayttotarkoitus` is a 1-digit code (NOT the 4-digit RKL/VTJ scheme):
#   1 asuinrakennus | 2 liikerakennus | 3 toimisto/liike |
#   5 hoitoala     | 6 talousrakennus (≈ kohdeluokka 42261, vajat/katokset)
#   8 teollisuus
# Code 6 dominates the outbuilding noise in Turku (~18k features, 40 m² median)
# and is excluded so PDF reports focus on substantive structures.
EXCLUDED_KAYTTOTARKOITUS_CODES = frozenset({6})
MIN_BUILDING_AREA_M2 = 30.0

BUILDINGS_TURKU_INTERIM = INTERIM_DIR / "buildings_turku.parquet"
BUILDINGS_TURKU_FGB = PROCESSED_DIR / "buildings_turku.fgb"
TIMESERIES_TURKU_PARQUET = PROCESSED_DIR / "timeseries_turku.parquet"
