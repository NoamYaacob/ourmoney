-- Read-only. See README.md in this directory. Emits "household_count|user_count".
SELECT
  (SELECT COUNT(*) FROM households WHERE id = '77777777-7777-7777-7777-777777777777') || '|' ||
  (SELECT COUNT(*) FROM auth.users WHERE id IN ('f0000000-0000-0000-0000-000000000070', 'f0000000-0000-0000-0000-000000000071'));
