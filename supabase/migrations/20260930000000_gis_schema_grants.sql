-- Dedicated schema for PostGIS (see docs/postgis-schema.md).
--
-- Fresh installs: 20260525000000_initial_schema.sql already created `gis`
-- and installed PostGIS into it; this migration only adds the grants.
--
-- maapera-prod: PostGIS is still in `public` until Supabase Support has
-- relocated it. This migration is intentionally non-destructive there: it
-- creates an empty `gis` schema (the relocation target) and grants usage.
-- It does NOT touch the extension, public.spatial_ref_sys or buildings.
--
-- `gis` is deliberately NOT in the Data API exposed schemas
-- (config.toml [api].schemas); it is only on the search path
-- ([api].extra_search_path) so PostgREST can resolve PostGIS functions.

CREATE SCHEMA IF NOT EXISTS gis;

-- Same access model Supabase uses for the `extensions` schema: API roles
-- may resolve types/functions, but get no CREATE and no new table rights.
GRANT USAGE ON SCHEMA gis TO anon, authenticated, service_role;
