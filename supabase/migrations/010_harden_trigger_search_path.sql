-- OurMoney — Migration 010: Harden generic updated_at trigger function
--
-- Supabase's database advisor flags functions with a role-mutable search_path.
-- update_updated_at() is a trigger-only helper and does not need caller-specific
-- name resolution. Pinning the path removes that ambiguity without changing
-- trigger behavior.

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Trigger functions are invoked by triggers, never directly through PostgREST.
REVOKE ALL ON FUNCTION update_updated_at() FROM PUBLIC, anon, authenticated;
