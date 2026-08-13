-- Read-only. Full statements content, one line per statement, tagged
-- with version and ordinal position, via COPY so embedded newlines and
-- special characters survive intact for exact comparison against local
-- migration files. Pure COPY, no NOTICE output mixed in.
COPY (
  SELECT version, ordinality, stmt
  FROM supabase_migrations.schema_migrations,
       LATERAL unnest(statements) WITH ORDINALITY AS t(stmt, ordinality)
  ORDER BY version, ordinality
) TO STDOUT WITH (FORMAT csv, HEADER true);
