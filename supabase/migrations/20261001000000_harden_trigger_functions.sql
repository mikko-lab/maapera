-- Security Advisor warnings (2026-09-30), both on trigger functions from
-- 20260525000000_initial_schema.sql. Idempotent; no data or behaviour change.

-- 1. "Function Search Path Mutable": public.update_updated_at_column had no
--    fixed search_path. It only calls NOW() (pg_catalog is always searched),
--    so an empty search_path is safe.
ALTER FUNCTION public.update_updated_at_column() SET search_path = '';

-- 2. "Public / Signed-In Users Can Execute SECURITY DEFINER Function":
--    public.handle_new_user() runs as its owner and is exposed as an RPC
--    (/rest/v1/rpc/handle_new_user). It is only meant to run as the
--    on_auth_user_created trigger. PostgreSQL checks EXECUTE when the
--    trigger is created, not when it fires, so revoking it keeps signups
--    working while removing the RPC.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
