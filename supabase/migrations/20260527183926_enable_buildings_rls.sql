-- Day-7 security fix: the public.buildings table was shipped in the
-- initial schema without RLS enabled, so the anon API key could
-- INSERT/UPDATE/DELETE rows directly. Supabase Database Advisor
-- flagged this on 2026-05-27. The data itself is intended to be
-- world-readable (it's already mirrored as a static FlatGeobuf in
-- web/public/data/), so we keep SELECT open to anon + authenticated
-- and rely on the absence of INSERT/UPDATE/DELETE policies to
-- block writes — service_role bypasses RLS and remains the only
-- mutating principal (used by the ETL).
--
-- Why this is the right shape (matches CLAUDE.md):
--   - `tracked_properties`, `profiles`, `alerts_sent`, `reports_generated`
--     are user-scoped — each has `auth.uid() = user_id` policies.
--   - `buildings` is reference data, not user data, so its policy is
--     a flat SELECT-true for both roles. There is intentionally no
--     INSERT/UPDATE/DELETE policy: without a matching policy the
--     default for RLS-enabled tables is deny, which is what we want
--     for everyone except service_role.

ALTER TABLE buildings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "buildings_public_read"
  ON buildings FOR SELECT
  TO anon, authenticated
  USING (true);

-- Verification (run after migration applies, expect rowsecurity=true):
--   SELECT schemaname, tablename, rowsecurity
--   FROM pg_tables
--   WHERE schemaname = 'public' AND tablename = 'buildings';
