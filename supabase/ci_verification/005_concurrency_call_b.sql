-- Concurrent call 2 of 2. See README.md in this directory.
SET ROLE authenticated;
SET request.jwt.claims = '{"sub":"f0000000-0000-0000-0000-000000000071","role":"authenticated"}';
SELECT leave_household();
