-- OurMoney — Migration 001: Initial schema (MVP-1 — Foundation & Auth)
--
-- Creates profiles, households, household_members, invitations, the two RLS
-- helper functions, the create_household and accept_invitation RPCs, and all
-- RLS policies for these four tables.
--
-- Financial tables (accounts, categories, category_rules, transactions,
-- recurring_transactions, budgets, budget_allocations, savings_goals) are
-- NOT created here — they land in migration 002 during MVP-2.
--
-- Ordering is deliberate (see docs/PHASE_1_PLAN.md#22-migration-001):
-- trigger functions before the tables that use them, tables before the RLS
-- helpers that query them, helpers before the policies that call them.

-- ============================================================================
-- 1. update_updated_at() — generic trigger function
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 2. handle_new_user() — auto-create a profile row on sign-up
-- ============================================================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (
    NEW.id,
    COALESCE(
      NULLIF(TRIM(NEW.raw_user_meta_data->>'display_name'), ''),
      split_part(NEW.email, '@', 1)
    )
  );
  RETURN NEW;
END;
$$;

-- Trigger functions are invoked by the trigger, never called directly.
-- PostgreSQL grants EXECUTE to PUBLIC by default on CREATE FUNCTION — revoke it.
REVOKE ALL ON FUNCTION handle_new_user() FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 3. profiles
-- ============================================================================

CREATE TABLE profiles (
  id            UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name  TEXT        NOT NULL,
  avatar_url    TEXT,
  locale        TEXT        NOT NULL DEFAULT 'he',
  timezone      TEXT        NOT NULL DEFAULT 'Asia/Jerusalem',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================================
-- 4. households
-- ============================================================================

CREATE TABLE households (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  currency    TEXT        NOT NULL DEFAULT 'ILS',
  created_by  UUID        NOT NULL REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON households
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- 5. household_members
-- ============================================================================

-- Supports N members by design. UX is optimized for two partners; the schema
-- assumes nothing of the kind. See ADR-006.
CREATE TABLE household_members (
  household_id  UUID        NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  user_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role          TEXT        NOT NULL DEFAULT 'member'
                            CHECK (role IN ('admin', 'member')),
  joined_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (household_id, user_id)
);

-- RLS inner lookup — most critical index in the schema.
CREATE INDEX idx_household_members_user ON household_members(user_id, household_id);

-- ============================================================================
-- 6. invitations
-- ============================================================================

CREATE TABLE invitations (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id  UUID        NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  invited_by    UUID        NOT NULL REFERENCES auth.users(id),
  email         TEXT,
  token         TEXT        NOT NULL UNIQUE
                            DEFAULT encode(gen_random_bytes(32), 'hex'),
  status        TEXT        NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending','accepted','expired','cancelled')),
  expires_at    TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '7 days',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_invitations_token ON invitations(token);
CREATE INDEX idx_invitations_email ON invitations(email);

-- ============================================================================
-- 7. is_household_member() — RLS helper
-- ============================================================================

CREATE OR REPLACE FUNCTION is_household_member(hid UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM household_members
    WHERE household_id = hid AND user_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION is_household_member(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION is_household_member(UUID) TO authenticated;

-- ============================================================================
-- 8. is_household_admin() — RLS helper
-- ============================================================================

CREATE OR REPLACE FUNCTION is_household_admin(hid UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM household_members
    WHERE household_id = hid AND user_id = auth.uid() AND role = 'admin'
  );
$$;

REVOKE ALL ON FUNCTION is_household_admin(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION is_household_admin(UUID) TO authenticated;

-- ============================================================================
-- 9. Enable RLS on all four tables
-- ============================================================================

ALTER TABLE profiles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE households        ENABLE ROW LEVEL SECURITY;
ALTER TABLE household_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations       ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 10. RLS policies
-- ============================================================================

-- profiles: anyone authenticated can read (needed to show partner name);
-- users can only update their own row.
CREATE POLICY "profiles_select" ON profiles
  FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY "profiles_update" ON profiles
  FOR UPDATE TO authenticated USING (id = auth.uid());

-- households: members can read their own household.
CREATE POLICY "households_select" ON households
  FOR SELECT TO authenticated USING (is_household_member(id));

-- NO INSERT POLICY. Households are created only by create_household().
-- A direct client INSERT would succeed here but the follow-up membership
-- INSERT would fail (household_members has no INSERT policy), leaving an
-- orphaned household that its own creator cannot see — households_select
-- requires membership. Denying the insert outright is the only way to make
-- that unreachable state actually unreachable.

CREATE POLICY "households_update" ON households
  FOR UPDATE TO authenticated USING (is_household_admin(id));

-- household_members: members can see who else is in their household.
CREATE POLICY "household_members_select" ON household_members
  FOR SELECT TO authenticated
  USING (is_household_member(household_id));

-- NO INSERT POLICY. NO UPDATE POLICY. This is deliberate — see ADR-022.
-- Membership is created exclusively by create_household() and
-- accept_invitation(), both SECURITY DEFINER. Roles are never changed by
-- clients.

-- Admins can remove members; members can remove themselves.
CREATE POLICY "household_members_delete" ON household_members
  FOR DELETE TO authenticated
  USING (
    user_id = auth.uid() OR is_household_admin(household_id)
  );

-- invitations: household members can see invitations for their household.
CREATE POLICY "invitations_select" ON invitations
  FOR SELECT TO authenticated
  USING (is_household_member(household_id));

-- Reading a specific invitation by token (for acceptance) is handled by the
-- accept_invitation() SECURITY DEFINER function, never by a permissive
-- policy here.

-- Only admins can create invitations.
CREATE POLICY "invitations_insert" ON invitations
  FOR INSERT TO authenticated
  WITH CHECK (is_household_admin(household_id));

-- Admins can cancel invitations.
CREATE POLICY "invitations_update" ON invitations
  FOR UPDATE TO authenticated
  USING (is_household_admin(household_id));

-- ============================================================================
-- 10b. Table grants for the `authenticated` role
-- ============================================================================
--
-- RLS policies alone are not sufficient: PostgREST/the Supabase client connect
-- as `authenticated` or `anon`, and Postgres checks the standard GRANT system
-- *before* RLS is ever evaluated. Newer Supabase projects are not
-- auto-exposed to the Data API by default (config.toml's
-- `auto_expose_new_tables` is off), so every table needs an explicit GRANT
-- matching exactly what its RLS policies already permit — nothing broader.
-- `anon` gets no grants on any of these tables; every policy above requires
-- `authenticated`.

GRANT SELECT, UPDATE ON profiles TO authenticated;
GRANT SELECT, UPDATE ON households TO authenticated;
GRANT SELECT, DELETE ON household_members TO authenticated;
GRANT SELECT, INSERT, UPDATE ON invitations TO authenticated;

-- ============================================================================
-- 11. create_household() RPC
-- ============================================================================

CREATE OR REPLACE FUNCTION create_household(p_name TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id      UUID := auth.uid();
  v_household_id UUID;
  v_name         TEXT := NULLIF(TRIM(p_name), '');
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;

  IF v_name IS NULL OR length(v_name) > 100 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_name');
  END IF;

  -- Serialize concurrent membership-creation calls for this user (ADR-020:
  -- one household per user). Without this, this function racing itself, or
  -- racing accept_invitation(), could each pass the EXISTS check below
  -- before either commits — they insert into different household_id rows,
  -- which share no constrained key to contend on, so nothing else prevents
  -- one user ending up a member of two households. Shares its lock
  -- namespace with accept_invitation() so the two functions serialize
  -- against each other too, not just against themselves. Released
  -- automatically at transaction end.
  PERFORM pg_advisory_xact_lock(72701, hashtext(v_user_id::text));

  -- MVP: one household per user (ADR-020)
  IF EXISTS (SELECT 1 FROM household_members WHERE user_id = v_user_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_in_household');
  END IF;

  INSERT INTO households (name, created_by)
  VALUES (v_name, v_user_id)
  RETURNING id INTO v_household_id;

  INSERT INTO household_members (household_id, user_id, role)
  VALUES (v_household_id, v_user_id, 'admin');

  RETURN jsonb_build_object('ok', true, 'household_id', v_household_id);
END;
$$;

REVOKE ALL ON FUNCTION create_household(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION create_household(TEXT) TO authenticated;

-- ============================================================================
-- 12. accept_invitation() RPC
-- ============================================================================

CREATE OR REPLACE FUNCTION accept_invitation(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp          -- (1) fixed search_path
AS $$
DECLARE
  v_invitation            invitations%ROWTYPE;
  v_user_id               UUID := auth.uid();
  v_existing_household_id UUID;
BEGIN
  -- (2) reject anonymous callers
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;

  -- Same lock, same namespace as create_household() — see the comment
  -- there. Without it, this function racing create_household() (or racing
  -- itself with two different tokens) could each pass the EXISTS check
  -- below before either commits, since the resulting inserts land in
  -- different household_id rows with no shared key to contend on.
  PERFORM pg_advisory_xact_lock(72701, hashtext(v_user_id::text));

  -- ADR-020 one-household-per-user, checked BEFORE the token is examined.
  -- Order matters: if this ran after validation, the caller could distinguish
  -- a valid token ('already_in_household') from an invalid one
  -- ('invalid_invitation'), which is exactly the oracle condition (9)
  -- forbids. The already-a-member case is handled inside this branch so a
  -- repeat tap still works.
  IF EXISTS (SELECT 1 FROM household_members WHERE user_id = v_user_id) THEN
    -- (6) already a member of the household this token targets: idempotent
    -- success. Any status is accepted here, including expired/cancelled —
    -- the user is already where the token would have put them, so surfacing
    -- an error would be misleading.
    SELECT hm.household_id INTO v_existing_household_id
    FROM household_members hm
    JOIN invitations i ON i.household_id = hm.household_id
    WHERE hm.user_id = v_user_id
      AND i.token = p_token
    LIMIT 1;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'ok', true,
        'household_id', v_existing_household_id,
        'already_member', true
      );
    END IF;

    RETURN jsonb_build_object('ok', false, 'error', 'already_in_household');
  END IF;

  -- (3)(4)(5)(8) fetch and lock the invitation; validate token, status, expiry.
  -- FOR UPDATE prevents two concurrent callers both passing validation.
  SELECT * INTO v_invitation
  FROM invitations
  WHERE token = p_token
  FOR UPDATE;

  -- (9) generic failure — never reveal whether the token existed, had
  --     already been used, or merely expired.
  IF NOT FOUND
     OR v_invitation.status <> 'pending'
     OR v_invitation.expires_at <= NOW()
  THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_invitation');
  END IF;

  -- (7) atomic: both statements commit together or neither does
  INSERT INTO household_members (household_id, user_id, role)
  VALUES (v_invitation.household_id, v_user_id, 'member');

  UPDATE invitations
  SET status = 'accepted'
  WHERE id = v_invitation.id;

  RETURN jsonb_build_object(
    'ok', true,
    'household_id', v_invitation.household_id,
    'already_member', false
  );
END;
$$;

-- (10) authenticated users only — never anon
REVOKE ALL ON FUNCTION accept_invitation(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION accept_invitation(TEXT) TO authenticated;
