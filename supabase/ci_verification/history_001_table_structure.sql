-- Read-only. Exact structure of supabase_migrations.schema_migrations —
-- columns, PK/unique constraints, checks, triggers. No assumptions.
DO $$
DECLARE v_cols TEXT;
BEGIN
  SELECT string_agg(column_name || ' ' || data_type || CASE WHEN is_nullable = 'NO' THEN ' NOT NULL' ELSE '' END, ', ' ORDER BY ordinal_position)
  INTO v_cols
  FROM information_schema.columns
  WHERE table_schema = 'supabase_migrations' AND table_name = 'schema_migrations';
  RAISE NOTICE 'columns: %', COALESCE(v_cols, '(table not found)');
END $$;

DO $$
DECLARE v_constraints TEXT;
BEGIN
  SELECT string_agg(tc.constraint_type || '(' || kcu.column_name || ')', ', ')
  INTO v_constraints
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
  WHERE tc.table_schema = 'supabase_migrations' AND tc.table_name = 'schema_migrations';
  RAISE NOTICE 'key constraints: %', COALESCE(v_constraints, '(none)');
END $$;

DO $$
DECLARE v_checks TEXT;
BEGIN
  SELECT string_agg(conname || ': ' || pg_get_constraintdef(oid), ' | ')
  INTO v_checks
  FROM pg_constraint
  WHERE conrelid = 'supabase_migrations.schema_migrations'::regclass AND contype = 'c';
  RAISE NOTICE 'check constraints: %', COALESCE(v_checks, '(none)');
END $$;

DO $$
DECLARE v_triggers TEXT;
BEGIN
  SELECT string_agg(tgname, ', ')
  INTO v_triggers
  FROM pg_trigger
  WHERE tgrelid = 'supabase_migrations.schema_migrations'::regclass AND NOT tgisinternal;
  RAISE NOTICE 'triggers: %', COALESCE(v_triggers, '(none)');
END $$;

DO $$
DECLARE v_row_count INT;
BEGIN
  SELECT COUNT(*) INTO v_row_count FROM supabase_migrations.schema_migrations;
  RAISE NOTICE 'row count: %', v_row_count;
END $$;
