-- OurMoney — Migration 018: tighten trigger-only function grants
--
-- Supabase grants EXECUTE on new functions to service_role by default in the
-- local stack. derive_savings_goal_completion() is invoked only by its
-- savings_goals trigger and must not be directly callable by application
-- roles, including service_role. Keep the function owner as the only role
-- with direct execute privileges.

REVOKE ALL ON FUNCTION derive_savings_goal_completion()
FROM PUBLIC, anon, authenticated, service_role;
