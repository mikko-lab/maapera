# PostGIS schema placement (`gis`)

## Why PostGIS must not live in `public`

The Supabase Data API (PostgREST) exposes every table in the schemas listed in
`supabase/config.toml` → `[api].schemas` (`public`, `graphql_public`).
`CREATE EXTENSION postgis` without `WITH SCHEMA` installs into `public`, which
creates `public.spatial_ref_sys` there. Security Advisor then reports
**RLS Disabled in Public — public.spatial_ref_sys (CRITICAL)** (and usually
also *Extension in Public* for `postgis`).

`spatial_ref_sys` is PostGIS's coordinate-system reference table, not Maaperä
user data, but it should not sit in an API-exposed schema.

## Why not just `ALTER TABLE public.spatial_ref_sys ENABLE ROW LEVEL SECURITY`

- The table is owned by the extension (and on Supabase usually by
  `supabase_admin`), so `postgres` may not be allowed to alter it.
- Extension upgrades (`ALTER EXTENSION postgis UPDATE`) and dump/restore
  treat it as extension-managed; local changes are fragile.
- It hides the real problem: all PostGIS functions and types would still be
  in the exposed `public` schema.

The fix is to move the extension out of `public`.

## Target layout

| Object | Schema |
|---|---|
| `postgis` extension, `geometry`/`geography` types, `ST_*` functions, `spatial_ref_sys` | `gis` |
| Maaperä tables (`buildings`, `profiles`, …) | `public` |

- `gis` is **not** in `[api].schemas` (not exposed by the Data API).
- `gis` **is** in `[api].extra_search_path` so PostgREST can resolve PostGIS
  functions (e.g. GeoJSON output).
- `anon`, `authenticated`, `service_role` get `USAGE` on `gis` only (no
  `CREATE`, no table privileges) — same model as Supabase's `extensions`
  schema.
- SQL that uses PostGIS should schema-qualify (`gis.ST_Area(...)`,
  `gis.geometry(...)`) or set `search_path` explicitly in functions.

## Fresh install (`supabase db reset`, new projects)

- `20260525000000_initial_schema.sql`:
  `CREATE SCHEMA IF NOT EXISTS gis; CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA gis;`
  and `buildings.geom gis.GEOMETRY(Polygon, 3067)`,
  `buildings.centroid gis.GEOGRAPHY(Point, 4326)`.
- `20260930000000_gis_schema_grants.sql`: `USAGE` grants on `gis`
  (idempotent; also safe on maapera-prod, see below).
- `supabase/tests/postgis_schema_rls_test.sql` (pgTAP, `supabase test db`)
  asserts the layout and the RLS model.

The initial migration was edited in place. This does not re-run on
maapera-prod: the CLI tracks applied migrations by version in
`supabase_migrations.schema_migrations`, and `20260525000000` is already
recorded there.

## Existing maapera-prod

PostGIS ≥ 2.3 is not relocatable:

```
ALTER EXTENSION postgis SET SCHEMA gis;
-- ERROR:  extension "postgis" does not support SET SCHEMA
```

The only in-database workarounds are (a) `DROP EXTENSION postgis CASCADE`,
which **drops `buildings.geom` and `buildings.centroid`**, or (b) editing
`pg_extension` by hand. Both are forbidden. The move must be done by
**Supabase Support**. `supabase db push` of this branch only adds an empty
`gis` schema + grants on prod; it does not touch PostGIS or `buildings`.

### Runbook

**1. Current state (read-only, SQL editor):**

```sql
SELECT extname, extversion, extnamespace::regnamespace AS schema
FROM pg_extension WHERE extname = 'postgis';

SELECT n.nspname, c.relname, pg_get_userbyid(c.relowner) AS owner, c.relrowsecurity
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relname = 'spatial_ref_sys';

SELECT schemaname, tablename, rowsecurity
FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;

SELECT count(*) AS n, md5(string_agg(building_id || ST_AsEWKB(geom)::text
       || ST_AsEWKB(centroid::geometry)::text, ',' ORDER BY building_id)) AS checksum
FROM public.buildings;   -- save n + checksum for step 4

SELECT table_schema, table_name, column_name, udt_schema, udt_name
FROM information_schema.columns WHERE udt_name IN ('geometry', 'geography');
```

**2. Backup (required before Support acts):**
- Confirm a recent daily backup / PITR restore point exists (Dashboard →
  Database → Backups), and
- take a logical dump of `public` data:
  `supabase db dump --data-only --schema public -f buildings_backup.sql`
  (plus `supabase db dump -f schema_backup.sql`). Store outside the repo.
- The `buildings` data can also be rebuilt from the ETL, but do not rely on
  that as the only backup.

**3. Request to Supabase Support** (project `maapera-prod`):

> Please relocate the PostGIS extension in our project from schema `public`
> to schema `gis` (already created by our migrations) **without**
> `DROP EXTENSION ... CASCADE` and without dropping or rewriting dependent
> columns. `public.buildings` has `geom geometry(Polygon,3067)` and
> `centroid geography(Point,4326)` with GiST indexes; their data and indexes
> must be preserved. After the move, `spatial_ref_sys` and all PostGIS
> functions/types should be in `gis` and `public.spatial_ref_sys` should no
> longer exist. Current version: PostGIS `<extversion from step 1>`,
> Postgres 17. Please confirm the method and maintenance window before
> executing. We have a backup from `<timestamp>`.

Right after Support confirms (same window): Dashboard → Project Settings →
Data API → **Extra search path**: add `gis` (keep `public, extensions`).
Do **not** add `gis` to *Exposed schemas*.

**4. Verification after the move:**

```sql
SELECT extnamespace::regnamespace FROM pg_extension WHERE extname = 'postgis'; -- gis
SELECT to_regclass('public.spatial_ref_sys');                                    -- NULL
SELECT to_regclass('gis.spatial_ref_sys');                                       -- gis.spatial_ref_sys
SELECT format_type(atttypid, atttypmod) FROM pg_attribute
WHERE attrelid = 'public.buildings'::regclass AND attname IN ('geom', 'centroid');
-- gis.geometry(Polygon,3067), gis.geography(Point,4326)
SELECT indexname FROM pg_indexes WHERE tablename = 'buildings';   -- idx_buildings_geom, idx_buildings_centroid present
SELECT count(*), md5(...same as step 1...) FROM public.buildings; -- identical n + checksum (use gis.ST_AsEWKB)
SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public';        -- all true
SELECT policyname, roles, cmd FROM pg_policies WHERE tablename = 'buildings';    -- buildings_public_read, SELECT, {anon,authenticated}
```

Then: Dashboard → Advisors → Security Advisor → **Rerun linter**. The
`RLS Disabled in Public: public.spatial_ref_sys` and `Extension in Public:
postgis` findings should be gone. Smoke-test the web map and an ETL
(`service_role`) write.

**5. Stop / rollback conditions:**
- Stop if Support's only offered method is `DROP EXTENSION postgis CASCADE`
  or anything that drops/rewrites `buildings` columns.
- Stop if step 2 backup cannot be confirmed.
- If step 4 row count/checksum, column types, indexes or RLS differ:
  do not continue, keep the site read-only, and restore from the step 2
  backup / PITR together with Support.
- If only API calls fail after the move, first check the Data API
  *Extra search path* contains `gis`.
