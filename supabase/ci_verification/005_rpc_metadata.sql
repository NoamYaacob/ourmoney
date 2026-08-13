-- Read-only. See README.md in this directory.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT p.proname,
           pg_get_function_identity_arguments(p.oid) AS args,
           p.prosecdef AS security_definer,
           p.proconfig AS config
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.proname IN ('leave_household', 'delete_own_account')
  LOOP
    RAISE NOTICE 'fn=% args=[%] security_definer=% config=%', r.proname, r.args, r.security_definer, r.config;
    IF r.args <> '' THEN
      RAISE EXCEPTION 'FAIL: % has non-zero parameters: %', r.proname, r.args;
    END IF;
    IF NOT r.security_definer THEN
      RAISE EXCEPTION 'FAIL: % is not SECURITY DEFINER', r.proname;
    END IF;
    IF r.config IS NULL OR NOT ('search_path=public, pg_temp' = ANY (r.config)) THEN
      RAISE EXCEPTION 'FAIL: % does not have a fixed search_path, got %', r.proname, r.config;
    END IF;
  END LOOP;
  RAISE NOTICE 'OK: leave_household and delete_own_account are both zero-arg, SECURITY DEFINER, fixed search_path';
END $$;

DO $$
DECLARE v_bad TEXT;
BEGIN
  SELECT string_agg(DISTINCT routine_name || ':' || grantee, ', ') INTO v_bad
  FROM information_schema.role_routine_grants
  WHERE routine_schema = 'public'
    AND routine_name IN ('leave_household', 'delete_own_account')
    AND grantee IN ('anon', 'PUBLIC');
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL: unexpected EXECUTE grants to anon/PUBLIC: %', v_bad;
  END IF;
  RAISE NOTICE 'OK: no anon/PUBLIC EXECUTE grants on leave_household/delete_own_account';
END $$;

DO $$
DECLARE v_grantees TEXT;
BEGIN
  SELECT string_agg(DISTINCT grantee, ',') INTO v_grantees
  FROM information_schema.role_routine_grants
  WHERE routine_schema = 'public' AND routine_name = 'leave_household';
  IF v_grantees IS DISTINCT FROM 'authenticated' THEN
    RAISE EXCEPTION 'FAIL: leave_household grantees are [%], expected exactly authenticated', v_grantees;
  END IF;
  RAISE NOTICE 'OK: leave_household granted to authenticated only';
END $$;
