-- Regression tests: trigger function hardening
-- (20261001000000_harden_trigger_functions.sql).
-- Run with `supabase test db` (pgTAP) against a fresh `supabase db reset`.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = extensions, public;

SELECT plan(6);

SELECT ok(
  (SELECT proconfig @> ARRAY['search_path=""'] FROM pg_proc
    WHERE oid = 'public.update_updated_at_column()'::regprocedure),
  'update_updated_at_column has a fixed empty search_path'
);

SELECT ok(NOT has_function_privilege('anon', 'public.handle_new_user()', 'EXECUTE'),
  'anon cannot execute handle_new_user');
SELECT ok(NOT has_function_privilege('authenticated', 'public.handle_new_user()', 'EXECUTE'),
  'authenticated cannot execute handle_new_user');

-- Signup trigger still creates the profile.
INSERT INTO auth.users (id, email)
VALUES ('00000000-0000-0000-0000-00000000f001', 'pgtap@example.invalid');
SELECT is(
  (SELECT tier::text FROM public.profiles WHERE id = '00000000-0000-0000-0000-00000000f001'),
  'registered',
  'on_auth_user_created still creates a registered profile'
);

-- updated_at trigger still works.
UPDATE public.profiles SET updated_at = '2000-01-01', company_name = 'x'
WHERE id = '00000000-0000-0000-0000-00000000f001';
SELECT ok(
  (SELECT updated_at > '2000-01-02' FROM public.profiles WHERE id = '00000000-0000-0000-0000-00000000f001'),
  'profiles_updated_at trigger still sets updated_at'
);

SET LOCAL ROLE anon;
SELECT throws_ok('SELECT public.handle_new_user()', '42501', NULL,
  'anon gets permission denied calling handle_new_user');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
