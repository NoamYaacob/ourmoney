-- Read-only. Ground-truth inspection of what actually exists on the
-- linked remote project, run because `supabase migration list` showed the
-- remote's applied-migration history (four rows under 2026-08-12 timestamp
-- versions) does not correspond by version string to any local file in
-- supabase/migrations/. This does not touch anything — it only reports.
DO $$
DECLARE v_tables TEXT;
BEGIN
  SELECT string_agg(table_name, ', ' ORDER BY table_name) INTO v_tables
  FROM information_schema.tables
  WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
  RAISE NOTICE 'public base tables: %', COALESCE(v_tables, '(none)');
END $$;

DO $$
DECLARE v_fns TEXT;
BEGIN
  SELECT string_agg(proname, ', ' ORDER BY proname) INTO v_fns
  FROM pg_proc
  WHERE pronamespace = 'public'::regnamespace;
  RAISE NOTICE 'public functions: %', COALESCE(v_fns, '(none)');
END $$;

DO $$
DECLARE v_policies TEXT;
BEGIN
  SELECT string_agg(c.relname || '.' || p.polname, ', ' ORDER BY c.relname, p.polname) INTO v_policies
  FROM pg_policy p
  JOIN pg_class c ON p.polrelid = c.oid
  JOIN pg_namespace n ON c.relnamespace = n.oid
  WHERE n.nspname = 'public';
  RAISE NOTICE 'public RLS policies: %', COALESCE(v_policies, '(none)');
END $$;

-- Specific checks for what migrations 001-004 would be expected to create,
-- so a human can judge equivalence regardless of migration-version labels.
DO $$
DECLARE
  v_missing_tables TEXT;
  v_expected TEXT[] := ARRAY['households','household_members','accounts','categories',
    'category_rules','transactions','recurring_transactions','budgets',
    'budget_allocations','savings_goals','invitations'];
  v_missing TEXT[] := ARRAY[]::TEXT[];
  t TEXT;
BEGIN
  FOREACH t IN ARRAY v_expected LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t AND table_type = 'BASE TABLE'
    ) THEN
      v_missing := array_append(v_missing, t);
    END IF;
  END LOOP;
  RAISE NOTICE 'expected tables MISSING from remote: %', COALESCE(array_to_string(v_missing, ', '), '(none — all present)');
END $$;

DO $$
DECLARE
  v_expected TEXT[] := ARRAY['create_household','accept_invitation','is_household_admin',
    'delete_own_account','leave_household','generate_recurring_transactions',
    'skip_recurring_occurrence','advance_recurring_due_date','save_budget_allocations'];
  v_missing TEXT[] := ARRAY[]::TEXT[];
  f TEXT;
BEGIN
  FOREACH f IN ARRAY v_expected LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname = f) THEN
      v_missing := array_append(v_missing, f);
    END IF;
  END LOOP;
  RAISE NOTICE 'expected functions MISSING from remote: %', COALESCE(array_to_string(v_missing, ', '), '(none — all present)');
END $$;

-- Row counts (small, safe to read) so a human can judge whether this is a
-- live/seeded environment or an empty shell.
DO $$
DECLARE v_counts TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='households') THEN
    SELECT
      'households=' || (SELECT COUNT(*) FROM households) ||
      ', household_members=' || (SELECT COUNT(*) FROM household_members)
    INTO v_counts;
    RAISE NOTICE 'row counts: %', v_counts;
  ELSE
    RAISE NOTICE 'row counts: households table does not exist, skipping';
  END IF;
END $$;
