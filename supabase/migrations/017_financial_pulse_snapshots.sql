-- OurMoney — Migration 017: financial_pulse_snapshots
--
-- CP8E — Financial Pulse ("מה השתנה מאז הפעם האחרונה?"). Persists the
-- smallest truthful state needed to answer "compared with the financial
-- state THIS USER last successfully saw": one row per (household, member),
-- holding only the one figure Financial Pulse's primary comparison needs
-- (safe_to_spend_agorot) and the moment it was captured. Everything else
-- Financial Pulse shows — the causal transaction, secondary recurring-
-- price-increase items — is derived live at read time from existing tables
-- (transactions, via their own txn_date) filtered against this row's own
-- captured_at, never a second persisted copy of financial truth that could
-- drift from the real one. See lib/engines/pulse/computeFinancialPulse.ts
-- for the read-time derivation and its own audit of what can/cannot be
-- proven this way.
--
-- Per-member, not per-household: "since last time I looked" is inherently
-- personal — two members of the same household can each have looked last
-- at a different moment, and one member's visit must never consume or
-- overwrite what Financial Pulse would show the other. Keyed
-- (household_id, user_id), not user_id alone, even though a user belongs
-- to at most one household today (an application-level invariant enforced
-- in create_household()/accept_invitation(), NOT a database constraint —
-- household_members has no UNIQUE(user_id) alone, see migration 001) —
-- matching every other financial table's (household_id, ...) shape costs
-- nothing extra today and avoids a silent correctness trap if that
-- invariant is ever loosened: "last seen for THIS household" would
-- otherwise become ambiguous across households sharing one row.
--
-- No FK to household_members: a plain "leave household" (migration 005)
-- only deletes the household_members row, nothing else — every other
-- financial table (transactions, budgets, ...) an ex-member created stays
-- in the household untouched, permanently invisible to them once
-- is_household_member(household_id) reads false. This table follows the
-- identical, already-established pattern: no special leave-household
-- cleanup, RLS alone makes an orphaned snapshot unreachable.
CREATE TABLE financial_pulse_snapshots (
  household_id         UUID        NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  user_id               UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- The one figure the primary Pulse comparison needs (Section 3 of this
  -- checkpoint's brief). Never a full copy of SafeToSpendResult — every
  -- other field on that result (availableCashAgorot, reservedAgorot, ...)
  -- is re-derivable live from current state and is not "what changed since
  -- last time" on its own; only the final number is what Financial Pulse
  -- diffs against.
  safe_to_spend_agorot  BIGINT      NOT NULL,
  -- The moment THIS row's safe_to_spend_agorot was captured — doubles as
  -- the boundary for every read-time-derived Pulse item (the causal
  -- transaction, secondary price-increase detections): anything dated on
  -- or after this timestamp's local calendar date is "since last time,"
  -- per computeFinancialPulse.ts.
  captured_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (household_id, user_id)
);

COMMENT ON TABLE financial_pulse_snapshots IS
  'CP8E Financial Pulse: one row per household member, the Safe-to-Spend figure and moment they last successfully saw it. Never a full financial-state copy — see this migration''s own header.';

ALTER TABLE financial_pulse_snapshots ENABLE ROW LEVEL SECURITY;

-- Strict per-member RLS: a member may read/write only their OWN row (never
-- another member's — "last seen" is personal, not household-shared truth
-- the way every other table's rows are), and only for a household they
-- currently belong to. Same is_household_member(household_id) helper every
-- other financial table's RLS uses (migration 001); user_id = auth.uid()
-- is the additional per-member restriction this table alone needs.
CREATE POLICY "financial_pulse_snapshots_select" ON financial_pulse_snapshots
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND is_household_member(household_id));

CREATE POLICY "financial_pulse_snapshots_insert" ON financial_pulse_snapshots
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND is_household_member(household_id));

CREATE POLICY "financial_pulse_snapshots_update" ON financial_pulse_snapshots
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND is_household_member(household_id))
  WITH CHECK (user_id = auth.uid() AND is_household_member(household_id));

-- No DELETE policy — nothing in the product ever deletes a snapshot
-- directly; the two FKs' ON DELETE CASCADE above are the only way a row
-- ever disappears (the household is deleted, or the user's account is).

-- Base privilege grants — every table's own set, per RLS's two-layer model
-- (RLS restricts ROWS; a GRANT is still required for the OPERATION itself
-- to be allowed at all). No DELETE, matching "no DELETE policy" above.
REVOKE ALL ON financial_pulse_snapshots FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON financial_pulse_snapshots TO authenticated;
