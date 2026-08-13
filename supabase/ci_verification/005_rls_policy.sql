-- Read-only. See README.md in this directory.
DO $$
DECLARE v_using TEXT;
BEGIN
  SELECT pg_get_expr(polqual, polrelid) INTO v_using
  FROM pg_policy
  WHERE polrelid = 'public.household_members'::regclass AND polname = 'household_members_delete';

  RAISE NOTICE 'household_members_delete USING: %', v_using;

  IF v_using IS NULL THEN
    RAISE EXCEPTION 'FAIL: household_members_delete policy not found';
  END IF;
  IF v_using NOT LIKE '%role <> ''admin''%' THEN
    RAISE EXCEPTION 'FAIL: policy does not exclude admin self-delete (expected "role <> ''admin''"), got: %', v_using;
  END IF;
  IF v_using NOT LIKE '%is_household_admin%' OR v_using NOT LIKE '%user_id <> auth.uid()%' THEN
    RAISE EXCEPTION 'FAIL: policy does not preserve the admin-removes-non-admin-member path, got: %', v_using;
  END IF;
  RAISE NOTICE 'OK: household_members_delete blocks admin self-delete while preserving admin-removes-member';
END $$;
