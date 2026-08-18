-- Read-only. Exact remote migration-history rows, for composing a
-- reconciliation proposal afterward. Does not modify anything.
SELECT version FROM supabase_migrations.schema_migrations ORDER BY version;
