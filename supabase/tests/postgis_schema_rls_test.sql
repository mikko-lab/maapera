-- Regression tests: PostGIS schema placement + public-schema RLS.
-- Run with `supabase test db` (pgTAP) against a fresh `supabase db reset`.
-- See docs/postgis-schema.md.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = extensions, public;

SELECT plan(22);

-- 1–3. PostGIS lives in `gis`, not `public`; spatial_ref_sys follows it.
SELECT is(
  (SELECT extnamespace::regnamespace::text FROM pg_extension WHERE extname = 'postgis'),
  'gis',
  'postgis extension is installed in schema gis'
);
SELECT hasnt_table('public', 'spatial_ref_sys', 'public.spatial_ref_sys does not exist');
SELECT has_table('gis', 'spatial_ref_sys', 'gis.spatial_ref_sys exists');
SELECT is(
  (SELECT count(*)::int FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname ILIKE 'st\_%'),
  0,
  'no PostGIS ST_* functions in public'
);

-- gis must not be exposed and API roles must not be able to create in it.
SELECT ok(NOT has_schema_privilege('anon', 'gis', 'CREATE'), 'anon cannot CREATE in gis');
SELECT ok(NOT has_schema_privilege('authenticated', 'gis', 'CREATE'), 'authenticated cannot CREATE in gis');
SELECT ok(has_schema_privilege('anon', 'gis', 'USAGE'), 'anon can resolve PostGIS types/functions');

-- 4. buildings.geom / buildings.centroid use the gis types and work.
-- (gis is not on this search_path, so format_type() schema-qualifies.)
SELECT is(
  (SELECT format_type(a.atttypid, a.atttypmod)
     FROM pg_attribute a
    WHERE a.attrelid = 'public.buildings'::regclass AND a.attname = 'geom'),
  'gis.geometry(Polygon,3067)',
  'buildings.geom is gis.geometry(Polygon,3067)'
);
SELECT is(
  (SELECT format_type(a.atttypid, a.atttypmod)
     FROM pg_attribute a
    WHERE a.attrelid = 'public.buildings'::regclass AND a.attname = 'centroid'),
  'gis.geography(Point,4326)',
  'buildings.centroid is gis.geography(Point,4326)'
);

INSERT INTO public.buildings (building_id, city, geom, centroid)
VALUES (
  '__pgtap_test__', 'Turku',
  gis.ST_GeomFromText('POLYGON((240000 6710000, 240010 6710000, 240010 6710010, 240000 6710010, 240000 6710000))', 3067),
  gis.ST_Transform(gis.ST_SetSRID(gis.ST_MakePoint(240005, 6710005), 3067), 4326)::gis.geography
);
SELECT is(
  (SELECT round(gis.ST_Area(geom))::int FROM public.buildings WHERE building_id = '__pgtap_test__'),
  100,
  'ST_Area on buildings.geom works (EPSG:3067 via gis.spatial_ref_sys)'
);
SELECT ok(
  (SELECT gis.ST_DWithin(centroid, centroid, 1) FROM public.buildings WHERE building_id = '__pgtap_test__'),
  'ST_DWithin on buildings.centroid (geography) works'
);
SELECT is(
  (SELECT count(*)::int FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'buildings'
     AND indexname IN ('idx_buildings_geom', 'idx_buildings_centroid')),
  2,
  'GIST indexes on geom and centroid exist'
);

-- 5–6. RLS enabled on every Maaperä table in public.
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.buildings'::regclass),          'buildings: RLS enabled');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.profiles'::regclass),           'profiles: RLS enabled');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.tracked_properties'::regclass), 'tracked_properties: RLS enabled');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.alerts_sent'::regclass),        'alerts_sent: RLS enabled');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.reports_generated'::regclass),   'reports_generated: RLS enabled');
SELECT is(
  (SELECT array_agg(c.relname::text ORDER BY c.relname) FROM pg_class c
    WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p') AND NOT c.relrowsecurity),
  NULL,
  'no table in public has RLS disabled'
);

-- 7. anon: SELECT allowed, no INSERT/UPDATE/DELETE on buildings.
SET LOCAL ROLE anon;
SELECT is(
  (SELECT count(*)::int FROM public.buildings WHERE building_id = '__pgtap_test__'),
  1,
  'anon can SELECT buildings'
);
SELECT throws_ok(
  $$INSERT INTO public.buildings (building_id, city, geom, centroid)
    SELECT 'x', city, geom, centroid FROM public.buildings WHERE building_id = '__pgtap_test__'$$,
  '42501', NULL, 'anon cannot INSERT into buildings'
);
SELECT throws_ok(
  $$UPDATE public.buildings SET city = 'x' WHERE building_id = '__pgtap_test__'$$,
  '42501', NULL, 'anon cannot UPDATE buildings'
);
SELECT throws_ok(
  $$DELETE FROM public.buildings WHERE building_id = '__pgtap_test__'$$,
  '42501', NULL, 'anon cannot DELETE from buildings'
);
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
