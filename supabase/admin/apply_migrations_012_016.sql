-- ============================================================================
-- Apply migrations 012-016 to the real "OurMoney Preview" Supabase project
-- (ref: safxtriacputgmpsdgkm)
-- ============================================================================
--
-- WHY THIS FILE EXISTS / WHY THIS METHOD
--
-- Real-preview diagnostics confirmed the live database is missing exactly
-- what migration 016 adds (installment_plans: PGRST205 "table not found";
-- transactions.installment_plan_id: 42703 "column does not exist"), and
-- migration 016 cannot apply standalone — its own RLS policies reference
-- transactions.obligation_id, which migration 012 adds. See
-- docs/MIGRATION_016_DEPLOYMENT_GAP.md for the full evidence trail,
-- including why `supabase db push` is NOT the recommended method here:
-- this project's own CI history (.github/workflows/migration-005-preview-
-- validation.yml) documents that this exact project's
-- supabase_migrations.schema_migrations bookkeeping table has previously
-- NOT matched this repo's migration filenames, and every real application
-- to this project on record has been a manual, direct-SQL application for
-- exactly that reason — never `db push`. This file follows that same
-- proven precedent rather than risk `db push` behaving unpredictably
-- against bookkeeping of unknown current state.
--
-- This file changes NOTHING by itself. It is meant to be copied into the
-- Supabase Dashboard's SQL Editor for the "OurMoney Preview" project and
-- run in the two separate steps marked below. Nothing in this file has
-- been executed from this environment — it has no credentials for that
-- project.
--
-- SAFETY PROPERTIES
--   - Section B (the only part that writes anything) is wrapped in one
--     transaction (BEGIN ... COMMIT). If ANY statement fails — including
--     "already exists" errors from a partially-applied prior attempt —
--     the ENTIRE transaction rolls back automatically. Nothing partial is
--     ever left behind.
--   - No DROP TABLE, no DELETE, no TRUNCATE, no RESET anywhere in this
--     file. Every existing table stays exactly as it is; the two DROP
--     POLICY statements (inherited verbatim from migrations 012 and 016)
--     drop and immediately recreate ACCESS RULES, never touching a row.
--   - Every new column migrations 012/016 add to `transactions` is
--     nullable (`obligation_id`, `installment_plan_id`, `installment_index`)
--     — existing rows are untouched and remain valid.
--   - Migration 014's INSERT is already idempotent in its original form
--     (WHERE NOT EXISTS) and is reproduced unmodified.
--   - Section A is 100% read-only (SELECT only) — safe to run any number
--     of times, including before you've decided anything.
--
-- WHAT WAS NOT CHANGED
--
-- The SQL in Section B is migrations 012, 013, 014, 015, 016 concatenated
-- in that exact order, byte-for-byte from supabase/migrations/ — nothing
-- rewritten, no statement made conditional, no semantics altered. This
-- project's own convention treats migrations as an immutable historical
-- record; the only thing added here is the transaction wrapper and this
-- header.


-- ============================================================================
-- SECTION A — PREFLIGHT (read-only; run this FIRST, in its own query)
-- ============================================================================
--
-- Paste and run this section alone first. It reports which objects from
-- migrations 012-016 already exist in the live database.
--
-- SAFE TO RUN SECTION B AS-IS when every row below shows FALSE (a clean
-- baseline stopping exactly at migration 011 — the expected, evidenced
-- state per docs/MIGRATION_016_DEPLOYMENT_GAP.md).
--
-- STOP — do NOT run Section B — if ANY row shows TRUE. That means some
-- part of 012-016 was applied at some point outside this repo's own
-- record (contradicting the evidence this procedure was built on). Running
-- Section B against that state will hit a hard "already exists" error and
-- safely roll back (see the transaction wrapper above) — but if you see
-- ANY true row here, stop and report back exactly which ones before
-- proceeding, rather than relying on the rollback as the safety net.

select 'transactions.obligation_id (012)' as object,
       exists (select 1 from information_schema.columns
               where table_name = 'transactions' and column_name = 'obligation_id') as already_exists
union all
select 'accounts_type_check includes loan/mortgage (013)',
       exists (select 1 from pg_constraint
               where conname = 'accounts_type_check'
                 and pg_get_constraintdef(oid) like '%''loan''%')
union all
select 'categories: arnona row exists (014)',
       exists (select 1 from categories where name_he = 'ארנונה' and is_system = true)
union all
select 'savings_goals.progress_source (015)',
       exists (select 1 from information_schema.columns
               where table_name = 'savings_goals' and column_name = 'progress_source')
union all
select 'update_savings_goal() 9-arg version (015)',
       exists (select 1 from pg_proc
               where proname = 'update_savings_goal' and pronargs = 9)
union all
select 'accounts.billing_cycle_day (016)',
       exists (select 1 from information_schema.columns
               where table_name = 'accounts' and column_name = 'billing_cycle_day')
union all
select 'installment_plans table (016)',
       exists (select 1 from information_schema.tables
               where table_name = 'installment_plans' and table_schema = 'public')
union all
select 'transactions.installment_plan_id (016)',
       exists (select 1 from information_schema.columns
               where table_name = 'transactions' and column_name = 'installment_plan_id')
union all
select 'transactions.installment_index (016)',
       exists (select 1 from information_schema.columns
               where table_name = 'transactions' and column_name = 'installment_index')
union all
select 'generate_installment_transactions() (016)',
       exists (select 1 from pg_proc where proname = 'generate_installment_transactions')
order by 1;


-- ============================================================================
-- SECTION B — APPLY (writes schema; run ONLY after Section A shows all-false)
-- ============================================================================
--
-- Paste and run this entire section as ONE query (it is one transaction).
-- Expected successful output: Supabase's SQL Editor shows "Success. No rows
-- returned" (this section is all DDL/INSERT, nothing SELECTs a result set).
-- If you see any error instead, the transaction has already rolled back —
-- nothing was left partially applied. Copy the exact error text and stop.

begin;

-- ---- migration 012: obligation_transaction_link -----------------------

alter table transactions
  add column obligation_id uuid references planned_obligations(id) on delete set null;

create index idx_transactions_obligation
  on transactions(obligation_id) where obligation_id is not null;

drop policy "transactions_insert" on transactions;
create policy "transactions_insert" on transactions
  for insert to authenticated
  with check (
    is_household_member(household_id)
    and transfer_id is null
    and obligation_id is null
    and account_id in (select id from accounts where accounts.household_id = transactions.household_id)
    and (
      category_id is null
      or category_id in (select id from categories where categories.household_id = transactions.household_id or categories.household_id is null)
    )
    and (
      recurring_id is null
      or recurring_id in (select id from recurring_transactions where recurring_transactions.household_id = transactions.household_id)
    )
    and (
      matched_rule_id is null
      or matched_rule_id in (select id from category_rules where category_rules.household_id = transactions.household_id)
    )
    and created_by = auth.uid()
    and (
      payer_id is null
      or payer_id in (select user_id from household_members where household_members.household_id = transactions.household_id)
    )
  );

drop policy "transactions_update" on transactions;
create policy "transactions_update" on transactions
  for update to authenticated
  using (is_household_member(household_id) and transfer_id is null and obligation_id is null)
  with check (
    is_household_member(household_id)
    and transfer_id is null
    and obligation_id is null
    and account_id in (select id from accounts where accounts.household_id = transactions.household_id)
    and (
      category_id is null
      or category_id in (select id from categories where categories.household_id = transactions.household_id or categories.household_id is null)
    )
    and (
      recurring_id is null
      or recurring_id in (select id from recurring_transactions where recurring_transactions.household_id = transactions.household_id)
    )
    and (
      matched_rule_id is null
      or matched_rule_id in (select id from category_rules where category_rules.household_id = transactions.household_id)
    )
    and (
      created_by is null
      or created_by in (select user_id from household_members where household_members.household_id = transactions.household_id)
    )
    and (
      payer_id is null
      or payer_id in (select user_id from household_members where household_members.household_id = transactions.household_id)
    )
  );

create or replace function complete_planned_obligation(
  p_id uuid,
  p_expected_version bigint,
  p_create_transaction boolean,
  p_account_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id        uuid := auth.uid();
  v_household_id   uuid;
  v_rows           int;
  v_amount_agorot  bigint;
  v_category_id    uuid;
  v_is_shared      boolean;
  v_name           text;
  v_new_version    bigint;
  v_transaction_id uuid;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'unauthenticated');
  end if;

  select household_id into v_household_id from household_members where user_id = v_user_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_a_member');
  end if;

  if p_create_transaction then
    if p_account_id is null then
      return jsonb_build_object('ok', false, 'error', 'missing_account');
    end if;
    if not exists (select 1 from accounts where id = p_account_id and household_id = v_household_id) then
      return jsonb_build_object('ok', false, 'error', 'invalid_account');
    end if;
  end if;

  update planned_obligations
  set status = 'completed', version = version + 1
  where id = p_id and household_id = v_household_id and version = p_expected_version and status = 'upcoming'
  returning amount_agorot, category_id, is_shared, name, version
    into v_amount_agorot, v_category_id, v_is_shared, v_name, v_new_version;
  get diagnostics v_rows = row_count;

  if v_rows <> 1 then
    if exists (select 1 from planned_obligations where id = p_id and household_id = v_household_id) then
      return jsonb_build_object('ok', false, 'error', 'conflict');
    end if;
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if p_create_transaction then
    insert into transactions (
      household_id, account_id, category_id, obligation_id,
      amount_agorot, description, txn_date, is_shared, source, created_by
    ) values (
      v_household_id, p_account_id, v_category_id, p_id,
      -v_amount_agorot, v_name, current_date, v_is_shared, 'manual', v_user_id
    )
    returning id into v_transaction_id;
  end if;

  return jsonb_build_object('ok', true, 'version', v_new_version, 'transaction_id', v_transaction_id);
end;
$$;

revoke all on function complete_planned_obligation(uuid, bigint, boolean, uuid) from public, anon;
grant execute on function complete_planned_obligation(uuid, bigint, boolean, uuid) to authenticated;

create or replace function set_planned_obligation_status(
  p_id uuid,
  p_expected_version bigint,
  p_status text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id      uuid := auth.uid();
  v_household_id uuid;
  v_rows         int;
  v_new_version  bigint;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'unauthenticated');
  end if;

  select household_id into v_household_id from household_members where user_id = v_user_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_a_member');
  end if;

  if p_status not in ('upcoming', 'completed', 'cancelled') then
    return jsonb_build_object('ok', false, 'error', 'invalid_status');
  end if;

  if exists (select 1 from transactions where obligation_id = p_id and household_id = v_household_id) then
    return jsonb_build_object('ok', false, 'error', 'has_linked_transaction');
  end if;

  update planned_obligations
  set status = p_status, version = version + 1
  where id = p_id and household_id = v_household_id and version = p_expected_version
  returning version into v_new_version;
  get diagnostics v_rows = row_count;

  if v_rows <> 1 then
    if exists (select 1 from planned_obligations where id = p_id and household_id = v_household_id) then
      return jsonb_build_object('ok', false, 'error', 'conflict');
    end if;
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  return jsonb_build_object('ok', true, 'version', v_new_version);
end;
$$;

revoke all on function set_planned_obligation_status(uuid, bigint, text) from public, anon;
grant execute on function set_planned_obligation_status(uuid, bigint, text) to authenticated;

-- ---- migration 013: loan_mortgage_account_types ------------------------

alter table accounts drop constraint accounts_type_check;
alter table accounts add constraint accounts_type_check
  check (type in (
    'checking','savings','credit_card',
    'cash','investment','loan','mortgage','other'
  ));

-- ---- migration 014: israeli_category_additions -------------------------

insert into categories (name_he, name_en, icon, is_income, is_system, sort_order)
select v.name_he, v.name_en, v.icon, v.is_income, true, v.sort_order
from (values
  ('ארנונה',                    'Municipal Tax (Arnona)',      '🏛️', false, 24),
  ('עמלות ותשלומים פיננסיים',   'Bank & Financial Fees',        '💳', false, 25),
  ('קצבאות וביטוח לאומי',       'Benefits & National Insurance', '🏦', true,  26)
) as v(name_he, name_en, icon, is_income, sort_order)
where not exists (
  select 1 from categories where categories.name_he = v.name_he and categories.is_system = true
);

-- ---- migration 015: savings_goal_progress_source -----------------------

alter table savings_goals
  add column progress_source text not null default 'manual'
    check (progress_source in ('manual', 'linked_account'));

alter table savings_goals
  add constraint savings_goals_linked_requires_account
    check (progress_source = 'manual' or account_id is not null);

create unique index idx_savings_goals_linked_account_unique
  on savings_goals(account_id)
  where progress_source = 'linked_account';

drop function if exists update_savings_goal(uuid, bigint, text, bigint, uuid, date, text, text);

create or replace function update_savings_goal(
  p_id uuid,
  p_expected_version bigint,
  p_name text,
  p_target_agorot bigint,
  p_account_id uuid,
  p_target_date date,
  p_icon text,
  p_color text,
  p_progress_source text default 'manual'
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id      uuid := auth.uid();
  v_household_id uuid;
  v_rows         int;
  v_new_version  bigint;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'unauthenticated');
  end if;

  select household_id into v_household_id from household_members where user_id = v_user_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_a_member');
  end if;

  if p_name is null or btrim(p_name) = '' then
    return jsonb_build_object('ok', false, 'error', 'missing_name');
  end if;
  if p_target_agorot is null or p_target_agorot <= 0 then
    return jsonb_build_object('ok', false, 'error', 'invalid_amount');
  end if;
  if p_account_id is not null and not exists (
    select 1 from accounts where id = p_account_id and household_id = v_household_id
  ) then
    return jsonb_build_object('ok', false, 'error', 'invalid_account');
  end if;
  if p_progress_source not in ('manual', 'linked_account') then
    return jsonb_build_object('ok', false, 'error', 'invalid_progress_source');
  end if;
  if p_progress_source = 'linked_account' then
    if p_account_id is null then
      return jsonb_build_object('ok', false, 'error', 'linked_account_requires_account');
    end if;
    if exists (
      select 1 from savings_goals
      where account_id = p_account_id and progress_source = 'linked_account' and id <> p_id
    ) then
      return jsonb_build_object('ok', false, 'error', 'account_already_linked');
    end if;
  end if;

  update savings_goals
  set name = btrim(p_name),
      target_agorot = p_target_agorot,
      account_id = p_account_id,
      target_date = p_target_date,
      icon = p_icon,
      color = p_color,
      progress_source = p_progress_source,
      version = version + 1
  where id = p_id and household_id = v_household_id and version = p_expected_version
  returning version into v_new_version;
  get diagnostics v_rows = row_count;

  if v_rows <> 1 then
    if exists (select 1 from savings_goals where id = p_id and household_id = v_household_id) then
      return jsonb_build_object('ok', false, 'error', 'conflict');
    end if;
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  return jsonb_build_object('ok', true, 'version', v_new_version);
end;
$$;

revoke all on function update_savings_goal(uuid, bigint, text, bigint, uuid, date, text, text, text) from public, anon;
grant execute on function update_savings_goal(uuid, bigint, text, bigint, uuid, date, text, text, text) to authenticated;

create or replace function update_savings_goal_progress(
  p_id uuid,
  p_expected_version bigint,
  p_current_agorot bigint
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id        uuid := auth.uid();
  v_household_id   uuid;
  v_progress_source text;
  v_rows           int;
  v_new_version    bigint;
  v_current_agorot bigint;
  v_is_completed   boolean;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'unauthenticated');
  end if;

  select household_id into v_household_id from household_members where user_id = v_user_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_a_member');
  end if;

  if p_current_agorot is null or p_current_agorot < 0 then
    return jsonb_build_object('ok', false, 'error', 'invalid_amount');
  end if;

  select progress_source into v_progress_source
  from savings_goals where id = p_id and household_id = v_household_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_progress_source = 'linked_account' then
    return jsonb_build_object('ok', false, 'error', 'progress_is_linked');
  end if;

  update savings_goals
  set current_agorot = p_current_agorot,
      version = version + 1
  where id = p_id and household_id = v_household_id and version = p_expected_version
  returning version, current_agorot, is_completed into v_new_version, v_current_agorot, v_is_completed;
  get diagnostics v_rows = row_count;

  if v_rows <> 1 then
    if exists (select 1 from savings_goals where id = p_id and household_id = v_household_id) then
      return jsonb_build_object('ok', false, 'error', 'conflict');
    end if;
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  return jsonb_build_object(
    'ok', true, 'version', v_new_version,
    'currentAgorot', v_current_agorot, 'isCompleted', v_is_completed
  );
end;
$$;

revoke all on function update_savings_goal_progress(uuid, bigint, bigint) from public, anon;
grant execute on function update_savings_goal_progress(uuid, bigint, bigint) to authenticated;

-- ---- migration 016: installment_plans -----------------------------------

alter table accounts
  add column billing_cycle_day integer check (billing_cycle_day between 1 and 28);

create table installment_plans (
  id                 uuid        primary key default gen_random_uuid(),
  household_id       uuid        not null references households(id) on delete cascade,
  account_id         uuid        not null references accounts(id),
  category_id        uuid        references categories(id),
  merchant_name      text,
  description        text        not null,
  total_agorot       bigint      not null check (total_agorot > 0),
  installment_count  integer     not null check (installment_count > 0),
  monthly_agorot     bigint      not null check (monthly_agorot > 0 and monthly_agorot = total_agorot / installment_count),
  first_charge_date  date        not null,
  is_shared          boolean     not null default true,
  created_by         uuid        references auth.users(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  version            bigint      not null default 1
);

create trigger set_updated_at before update on installment_plans
  for each row execute function update_updated_at();

create index idx_installment_plans_household on installment_plans(household_id);

alter table installment_plans enable row level security;

create policy "installment_plans_select" on installment_plans
  for select to authenticated using (is_household_member(household_id));

create policy "installment_plans_insert" on installment_plans
  for insert to authenticated
  with check (
    is_household_member(household_id)
    and account_id in (
      select id from accounts
      where accounts.household_id = installment_plans.household_id and accounts.type = 'credit_card'
    )
    and (
      category_id is null
      or category_id in (select id from categories where categories.household_id = installment_plans.household_id or categories.household_id is null)
    )
    and created_by = auth.uid()
  );

revoke all on installment_plans from public, anon, authenticated;
grant select, insert on installment_plans to authenticated;

alter table transactions
  add column installment_plan_id uuid references installment_plans(id) on delete set null,
  add column installment_index   integer;

alter table transactions add constraint transactions_installment_index_positive
  check (installment_index is null or installment_index >= 1);

create index idx_transactions_installment_plan
  on transactions(installment_plan_id) where installment_plan_id is not null;

drop policy "transactions_insert" on transactions;
create policy "transactions_insert" on transactions
  for insert to authenticated
  with check (
    is_household_member(household_id)
    and transfer_id is null
    and obligation_id is null
    and installment_plan_id is null
    and account_id in (select id from accounts where accounts.household_id = transactions.household_id)
    and (
      category_id is null
      or category_id in (select id from categories where categories.household_id = transactions.household_id or categories.household_id is null)
    )
    and (
      recurring_id is null
      or recurring_id in (select id from recurring_transactions where recurring_transactions.household_id = transactions.household_id)
    )
    and (
      matched_rule_id is null
      or matched_rule_id in (select id from category_rules where category_rules.household_id = transactions.household_id)
    )
    and created_by = auth.uid()
    and (
      payer_id is null
      or payer_id in (select user_id from household_members where household_members.household_id = transactions.household_id)
    )
  );

drop policy "transactions_update" on transactions;
create policy "transactions_update" on transactions
  for update to authenticated
  using (
    is_household_member(household_id)
    and transfer_id is null
    and obligation_id is null
    and installment_plan_id is null
  )
  with check (
    is_household_member(household_id)
    and transfer_id is null
    and obligation_id is null
    and installment_plan_id is null
    and account_id in (select id from accounts where accounts.household_id = transactions.household_id)
    and (
      category_id is null
      or category_id in (select id from categories where categories.household_id = transactions.household_id or categories.household_id is null)
    )
    and (
      recurring_id is null
      or recurring_id in (select id from recurring_transactions where recurring_transactions.household_id = transactions.household_id)
    )
    and (
      matched_rule_id is null
      or matched_rule_id in (select id from category_rules where category_rules.household_id = transactions.household_id)
    )
    and (
      created_by is null
      or created_by in (select user_id from household_members where household_members.household_id = transactions.household_id)
    )
    and (
      payer_id is null
      or payer_id in (select user_id from household_members where household_members.household_id = transactions.household_id)
    )
  );

create or replace function update_installment_plan(
  p_id uuid,
  p_expected_version bigint,
  p_description text,
  p_merchant_name text,
  p_category_id uuid,
  p_is_shared boolean
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id      uuid := auth.uid();
  v_household_id uuid;
  v_rows         int;
  v_new_version  bigint;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'unauthenticated');
  end if;

  select household_id into v_household_id from household_members where user_id = v_user_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_a_member');
  end if;

  if p_description is null or btrim(p_description) = '' then
    return jsonb_build_object('ok', false, 'error', 'missing_description');
  end if;
  if p_category_id is not null and not exists (
    select 1 from categories where id = p_category_id and (household_id = v_household_id or household_id is null)
  ) then
    return jsonb_build_object('ok', false, 'error', 'invalid_category');
  end if;

  update installment_plans
  set description = btrim(p_description),
      merchant_name = p_merchant_name,
      category_id = p_category_id,
      is_shared = p_is_shared,
      version = version + 1
  where id = p_id and household_id = v_household_id and version = p_expected_version
  returning version into v_new_version;
  get diagnostics v_rows = row_count;

  if v_rows <> 1 then
    if exists (select 1 from installment_plans where id = p_id and household_id = v_household_id) then
      return jsonb_build_object('ok', false, 'error', 'conflict');
    end if;
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  return jsonb_build_object('ok', true, 'version', v_new_version);
end;
$$;

revoke all on function update_installment_plan(uuid, bigint, text, text, uuid, boolean) from public, anon;
grant execute on function update_installment_plan(uuid, bigint, text, text, uuid, boolean) to authenticated;

create or replace function delete_installment_plan(
  p_id uuid,
  p_expected_version bigint
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id      uuid := auth.uid();
  v_household_id uuid;
  v_rows         int;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'unauthenticated');
  end if;

  select household_id into v_household_id from household_members where user_id = v_user_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_a_member');
  end if;

  delete from installment_plans
  where id = p_id and household_id = v_household_id and version = p_expected_version;
  get diagnostics v_rows = row_count;

  if v_rows <> 1 then
    if exists (select 1 from installment_plans where id = p_id and household_id = v_household_id) then
      return jsonb_build_object('ok', false, 'error', 'conflict');
    end if;
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function delete_installment_plan(uuid, bigint) from public, anon;
grant execute on function delete_installment_plan(uuid, bigint) to authenticated;

create or replace function generate_installment_transactions()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id        uuid := auth.uid();
  v_household_id   uuid;
  v_plan           record;
  v_next_index     int;
  v_charge_date    date;
  v_amount_agorot  bigint;
  v_transaction_id uuid;
  v_results        jsonb := '[]'::jsonb;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'unauthenticated');
  end if;

  select household_id into v_household_id
  from household_members
  where user_id = v_user_id
  limit 1;

  if v_household_id is null then
    return jsonb_build_object('ok', false, 'error', 'no_household');
  end if;

  for v_plan in
    select * from installment_plans where household_id = v_household_id order by id for update
  loop
    select coalesce(max(installment_index), 0) + 1 into v_next_index
    from transactions
    where installment_plan_id = v_plan.id;

    while v_next_index <= v_plan.installment_count loop
      v_charge_date := (v_plan.first_charge_date + ((v_next_index - 1) * interval '1 month'))::date;
      exit when v_charge_date > current_date;

      v_amount_agorot := case
        when v_next_index = v_plan.installment_count
          then v_plan.total_agorot - v_plan.monthly_agorot * (v_plan.installment_count - 1)
        else v_plan.monthly_agorot
      end;

      insert into transactions (
        household_id, account_id, category_id, installment_plan_id, installment_index,
        amount_agorot, description, txn_date, is_shared, source, created_by
      ) values (
        v_household_id, v_plan.account_id, v_plan.category_id, v_plan.id, v_next_index,
        -v_amount_agorot, v_plan.description, v_charge_date, v_plan.is_shared, 'manual', v_user_id
      ) returning id into v_transaction_id;

      v_results := v_results || jsonb_build_object(
        'installmentPlanId', v_plan.id,
        'transactionId', v_transaction_id,
        'installmentIndex', v_next_index,
        'txnDate', v_charge_date
      );

      v_next_index := v_next_index + 1;
    end loop;
  end loop;

  return jsonb_build_object('ok', true, 'results', v_results);
end;
$$;

revoke all on function generate_installment_transactions() from public, anon;
grant execute on function generate_installment_transactions() to authenticated;

create or replace function leave_household()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id            uuid := auth.uid();
  v_household_id       uuid;
  v_role               text;
  v_other_member_count int;
  v_new_admin_id       uuid;
  v_household_deleted  boolean := false;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'unauthenticated');
  end if;

  select household_id into v_household_id
  from household_members
  where user_id = v_user_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_a_member');
  end if;

  perform pg_advisory_xact_lock(72702, hashtext(v_household_id::text));

  select role into v_role
  from household_members
  where household_id = v_household_id and user_id = v_user_id;

  if not found then
    return jsonb_build_object('ok', true, 'household_deleted', false, 'new_admin_id', null);
  end if;

  select count(*) into v_other_member_count
  from household_members
  where household_id = v_household_id and user_id <> v_user_id;

  if v_other_member_count = 0 then
    delete from households where id = v_household_id;
    v_household_deleted := true;
  else
    if v_role = 'admin' then
      select user_id into v_new_admin_id
      from household_members
      where household_id = v_household_id and user_id <> v_user_id
      order by joined_at asc
      limit 1
      for update;

      if found then
        update household_members
        set role = 'admin'
        where household_id = v_household_id and user_id = v_new_admin_id;
      else
        v_new_admin_id := null;
      end if;
    end if;

    update households
      set created_by = null
      where id = v_household_id and created_by = v_user_id;
    update invitations
      set invited_by = null
      where household_id = v_household_id and invited_by = v_user_id;
    update accounts
      set owner_id = null
      where household_id = v_household_id and owner_id = v_user_id;
    update transactions
      set payer_id = null
      where household_id = v_household_id and payer_id = v_user_id;
    update transactions
      set created_by = null
      where household_id = v_household_id and created_by = v_user_id;
    update recurring_transactions
      set created_by = null
      where household_id = v_household_id and created_by = v_user_id;
    update savings_goals
      set created_by = null
      where household_id = v_household_id and created_by = v_user_id;
    update planned_obligations
      set created_by = null
      where household_id = v_household_id and created_by = v_user_id;
    update transfers
      set created_by = null
      where household_id = v_household_id and created_by = v_user_id;
    update installment_plans
      set created_by = null
      where household_id = v_household_id and created_by = v_user_id;

    delete from household_members
    where household_id = v_household_id and user_id = v_user_id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'household_deleted', v_household_deleted,
    'new_admin_id', v_new_admin_id
  );
end;
$$;

revoke all on function leave_household() from public, anon;
grant execute on function leave_household() to authenticated;

create or replace function delete_own_account()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id            uuid := auth.uid();
  v_household_id       uuid;
  v_role               text;
  v_other_member_count int;
  v_new_admin_id       uuid;
  v_household_deleted  boolean := false;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'unauthenticated');
  end if;

  select household_id into v_household_id
  from household_members
  where user_id = v_user_id;

  if found then
    perform pg_advisory_xact_lock(72702, hashtext(v_household_id::text));

    select role into v_role
    from household_members
    where household_id = v_household_id and user_id = v_user_id;

    select count(*) into v_other_member_count
    from household_members
    where household_id = v_household_id and user_id <> v_user_id;

    if v_other_member_count = 0 then
      delete from households where id = v_household_id;
      v_household_deleted := true;
    else
      if v_role = 'admin' then
        select user_id into v_new_admin_id
        from household_members
        where household_id = v_household_id and user_id <> v_user_id
        order by joined_at asc
        limit 1
        for update;

        if found then
          update household_members
          set role = 'admin'
          where household_id = v_household_id and user_id = v_new_admin_id;
        else
          v_new_admin_id := null;
        end if;
      end if;

      update households
        set created_by = null
        where id = v_household_id and created_by = v_user_id;
      update invitations
        set invited_by = null
        where household_id = v_household_id and invited_by = v_user_id;
      update accounts
        set owner_id = null
        where household_id = v_household_id and owner_id = v_user_id;
      update transactions
        set payer_id = null
        where household_id = v_household_id and payer_id = v_user_id;
      update transactions
        set created_by = null
        where household_id = v_household_id and created_by = v_user_id;
      update recurring_transactions
        set created_by = null
        where household_id = v_household_id and created_by = v_user_id;
      update savings_goals
        set created_by = null
        where household_id = v_household_id and created_by = v_user_id;
      update planned_obligations
        set created_by = null
        where household_id = v_household_id and created_by = v_user_id;
      update transfers
        set created_by = null
        where household_id = v_household_id and created_by = v_user_id;
      update installment_plans
        set created_by = null
        where household_id = v_household_id and created_by = v_user_id;
    end if;
  end if;

  delete from auth.users where id = v_user_id;

  return jsonb_build_object(
    'ok', true,
    'household_deleted', v_household_deleted,
    'new_admin_id', v_new_admin_id
  );
end;
$$;

revoke all on function delete_own_account() from public, anon;
grant execute on function delete_own_account() to authenticated;

commit;


-- ============================================================================
-- SECTION C — POST-APPLY VERIFICATION (read-only; run after Section B commits)
-- ============================================================================

select 'installment_plans exists' as check, exists (
  select 1 from information_schema.tables where table_name = 'installment_plans' and table_schema = 'public'
) as pass
union all
select 'transactions.installment_plan_id exists', exists (
  select 1 from information_schema.columns where table_name = 'transactions' and column_name = 'installment_plan_id'
)
union all
select 'transactions.installment_index exists', exists (
  select 1 from information_schema.columns where table_name = 'transactions' and column_name = 'installment_index'
)
union all
select 'transactions.obligation_id exists', exists (
  select 1 from information_schema.columns where table_name = 'transactions' and column_name = 'obligation_id'
)
union all
select 'accounts.billing_cycle_day exists', exists (
  select 1 from information_schema.columns where table_name = 'accounts' and column_name = 'billing_cycle_day'
)
union all
select 'installment_plans_select policy exists', exists (
  select 1 from pg_policies where tablename = 'installment_plans' and policyname = 'installment_plans_select'
)
union all
select 'installment_plans_insert policy exists', exists (
  select 1 from pg_policies where tablename = 'installment_plans' and policyname = 'installment_plans_insert'
)
union all
select 'transactions_insert policy references installment_plan_id', exists (
  select 1 from pg_policies where tablename = 'transactions' and policyname = 'transactions_insert'
    and (qual like '%installment_plan_id%' or with_check like '%installment_plan_id%')
)
union all
select 'transactions_update policy references installment_plan_id', exists (
  select 1 from pg_policies where tablename = 'transactions' and policyname = 'transactions_update'
    and (qual like '%installment_plan_id%' or with_check like '%installment_plan_id%')
)
union all
select 'fk transactions_installment_plan_id_fkey exists', exists (
  select 1 from pg_constraint where conname = 'transactions_installment_plan_id_fkey'
)
union all
select 'fk transactions_obligation_id_fkey exists', exists (
  select 1 from pg_constraint where conname = 'transactions_obligation_id_fkey'
)
union all
select 'idx_transactions_installment_plan exists', exists (
  select 1 from pg_indexes where indexname = 'idx_transactions_installment_plan'
)
union all
select 'idx_transactions_obligation exists', exists (
  select 1 from pg_indexes where indexname = 'idx_transactions_obligation'
)
union all
select 'idx_installment_plans_household exists', exists (
  select 1 from pg_indexes where indexname = 'idx_installment_plans_household'
)
union all
select 'generate_installment_transactions() exists', exists (
  select 1 from pg_proc where proname = 'generate_installment_transactions'
)
union all
select 'update_installment_plan() exists', exists (
  select 1 from pg_proc where proname = 'update_installment_plan'
)
union all
select 'delete_installment_plan() exists', exists (
  select 1 from pg_proc where proname = 'delete_installment_plan'
)
order by 1;

-- Row-count sanity checks — every existing row must still be present.
-- Compare these counts against what you already know your data to be
-- BEFORE running Section B (e.g. from the [QA]-cleanup audit query in
-- supabase/admin/cleanup_qa_records.sql, or your own prior check) — they
-- must be identical after. This section only adds columns/tables/rows to
-- NEW objects; it must never change these counts.
select 'transactions' as table_name, count(*) as row_count from transactions
union all
select 'planned_obligations', count(*) from planned_obligations
union all
select 'savings_goals', count(*) from savings_goals
union all
select 'accounts', count(*) from accounts
union all
select 'categories', count(*) from categories;
