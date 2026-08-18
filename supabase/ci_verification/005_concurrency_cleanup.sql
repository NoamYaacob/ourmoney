-- Idempotent cleanup for the concurrency fixture. Safe to run even if the
-- happy path already removed some/all of these rows. See README.md.
DELETE FROM household_members WHERE household_id = '77777777-7777-7777-7777-777777777777';
DELETE FROM households WHERE id = '77777777-7777-7777-7777-777777777777';
DELETE FROM auth.users WHERE id IN ('f0000000-0000-0000-0000-000000000070', 'f0000000-0000-0000-0000-000000000071');
