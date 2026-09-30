-- Security Advisor warnings (2026-09-30): "Public / Signed-In Users Can
-- Execute SECURITY DEFINER Function" on public.rls_auto_enable().
--
-- rls_auto_enable() is not created by this repo. On maapera-prod it backs the
-- `ensure_rls` event trigger (ddl_command_end), which enables RLS on every
-- new table in `public`. We keep it and only revoke direct EXECUTE:
-- event triggers do not check EXECUTE when they fire, so auto-RLS keeps
-- working, and the function is no longer callable as an RPC.
--
-- Guarded so fresh/local databases without the function are unaffected.
DO $$
BEGIN
  IF to_regprocedure('public.rls_auto_enable()') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;
  END IF;
END $$;
