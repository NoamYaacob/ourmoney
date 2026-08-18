-- OurMoney — Migration 011: remove every direct EXECUTE ACL from the
-- recurring version-enforcement trigger function.
--
-- enforce_recurring_transaction_version() is trigger-only. Migration 009
-- already revoked EXECUTE from PUBLIC, anon, and authenticated; PostgreSQL
-- still retained an explicit owner ACL for postgres, so the structural test
-- requiring zero direct grants correctly found one remaining catalog entry.
-- Trigger execution does not require callers to hold EXECUTE on the trigger
-- function, so no application role needs a direct callable path here.

REVOKE EXECUTE ON FUNCTION public.enforce_recurring_transaction_version() FROM postgres;
