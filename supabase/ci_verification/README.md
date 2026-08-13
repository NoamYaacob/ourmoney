# CI-only verification SQL

These files exist solely for
`.github/workflows/migration-005-preview-validation.yml` — a one-off,
manually-dispatched validation of `supabase/migrations/005_leave_household.sql`
against the real hosted OurMoney Preview project. They are **not** part of
`supabase/rls_tests.sql` and are not run by any other workflow.

They are separate files (rather than inline heredocs in the workflow YAML)
because a bash heredoc's closing delimiter must be unindented, which
conflicts with YAML's requirement that every line of a block scalar (`run: |`)
be indented at least as much as its first line — mixing the two reliably
breaks either the YAML parse or the heredoc, depending on which rule loses.
Plain files sidestep that entirely.

Each file is read-only or self-cleaning (fixture rows scoped to dedicated
IDs distinct from every fixture already used in `rls_tests.sql`):

- `005_rpc_metadata.sql` — asserts `leave_household()`/`delete_own_account()`
  are zero-argument, `SECURITY DEFINER`, fixed `search_path`, and granted to
  `authenticated` only (no `anon`/`PUBLIC`).
- `005_rls_policy.sql` — asserts the `household_members_delete` policy text
  blocks admin self-delete while preserving admin-removes-member.
- `005_concurrency_setup.sql` / `_call_a.sql` / `_call_b.sql` /
  `_postcheck.sql` / `_cleanup.sql` — a true-concurrency check: two real,
  independently-connected `psql` processes launched in parallel by the
  workflow both call `leave_household()` for the two members of the same
  fixture household at once. This replaces `rls_tests.sql`'s
  `LEAVE.CONCURRENT` dblink section for this run only, because that section
  hard-codes `host=db` (the local `supabase start` docker-compose service
  name), which does not resolve against a hosted project.

Safe to delete after this validation task is complete if the workflow itself
is also removed.
