-- Read-only. Full row metadata for every existing schema_migrations row.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT version, name, created_by, idempotency_key,
                  array_length(statements, 1) AS n_statements,
                  array_length(rollback, 1) AS n_rollback
           FROM supabase_migrations.schema_migrations
           ORDER BY version
  LOOP
    RAISE NOTICE 'ROW version=% name=% created_by=% idempotency_key=% n_statements=% n_rollback=%',
      r.version, r.name, r.created_by, r.idempotency_key, r.n_statements, r.n_rollback;
  END LOOP;
END $$;
