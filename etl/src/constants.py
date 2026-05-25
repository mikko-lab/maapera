"""Project-wide constants for the ETL pipeline."""

from pathlib import Path

ETL_ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ETL_ROOT / "data"
RAW_DIR = DATA_DIR / "raw"
INTERIM_DIR = DATA_DIR / "interim"
PROCESSED_DIR = DATA_DIR / "processed"

MML_L41_GPKG = RAW_DIR / "mml" / "L41.gpkg"
MML_RAKENNUS_LAYER = "rakennus_p"

CRS_TM35FIN = "EPSG:3067"
CRS_WGS84 = "EPSG:4326"
CRS_ETRS_LAEA = "EPSG:3035"

TURKU_MUNICIPALITY_CODE = "853"
# Generous bbox in EPSG:3067 covering all of Turku municipality.
TURKU_BBOX_3067 = (220_000.0, 6_695_000.0, 260_000.0, 6_730_000.0)

BUILDINGS_TURKU_INTERIM = INTERIM_DIR / "buildings_turku.parquet"
