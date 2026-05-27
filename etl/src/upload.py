"""Upload exported artifacts to cloud storage.

STUB — Day 6 task. Wire actual S3/Supabase clients here once the R2
bucket and Supabase storage bucket are provisioned and credentials are
in ``.env`` (see ``.env.example`` for variable names).
"""

from __future__ import annotations

from pathlib import Path


def upload_to_r2(parquet_path: Path, key: str) -> str:
    """Upload a Parquet file to Cloudflare R2; return the public URL.

    Used for the time-series Parquet — gated by the timeseries Edge
    Function, which signs Range-read URLs per request.
    """
    raise NotImplementedError(
        "Day 6 task — implement when Supabase storage and R2 bucket configured"
    )


def upload_to_supabase_storage(fgb_path: Path, key: str) -> str:
    """Upload a FlatGeobuf to Supabase Storage; return the public URL.

    Used for the building polygons FGB — served as a static asset to
    the frontend via bbox-based HTTP Range requests.
    """
    raise NotImplementedError(
        "Day 6 task — implement when Supabase storage and R2 bucket configured"
    )
