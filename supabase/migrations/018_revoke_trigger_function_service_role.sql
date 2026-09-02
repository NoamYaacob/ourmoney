-- OurMoney — Migration 018: tighten trigger-only function grants
--
-- Supabase grants EXECUTE on new functions to service_role by default in the
-- local stack. The functions below are invoked only by database triggers and
-- must not be directly callable by application roles, including service_role.
-- Keep the function owner as the only role with direct execute privileges.

REVOKE ALL ON FUNCTION derive_savings_goal_completion()
FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION enforce_recurring_transaction_version()
FROM PUBLIC, anon, authenticated, service_role;
