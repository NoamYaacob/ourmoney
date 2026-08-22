-- OurMoney — Migration 014: Israeli category additions
--
-- Foundation item from the Israeli-household product-evolution audit (Phase
-- E — categories). categories is already the single canonical source (no
-- parallel category list anywhere in the app — confirmed by the STEP 1
-- audit); this migration only adds rows to it, using the exact same
-- idempotent seed pattern migration 002 established (WHERE NOT EXISTS on
-- name_he + is_system, so a repeated `db push` never duplicates a row).
--
-- Explicit product decision (user, in response to the audit's open
-- question): do NOT add a second, expense-side "השקעות" category. Moving
-- money from checking/cash into an investment account is a transfer /
-- asset allocation, not consumer spending — it must not inflate expenses
-- or budget usage, and belongs to the internal-transfer feature (migration
-- 008), not a category. The existing income-side "השקעות" category
-- (migration 002, row 22 of the original 23-row seed) is untouched by this
-- migration — it is not renamed, deleted, or reused, since doing so could
-- affect existing categorized transactions without an explicit decision to
-- do that.
--
-- The four rows below fill genuine, uncontroversial gaps in the original
-- 18 expense / 5 income seed for an Israeli household, without fragmenting
-- existing categories (e.g. not splitting the existing generic "תחבורה"
-- into car sub-categories, which is a judgment call better left to a
-- dedicated categories-review pass):
--   ארנונה (Municipal / property tax — "arnona") — a large, near-universal
--     recurring Israeli household expense with no home in the existing set
--     (distinct from "דיור ושכירות", which is rent/mortgage itself).
--   עמלות ותשלומים פיננסיים (Bank & financial fees) — gives investment-
--     related fees and taxes a real category to live in, per the same
--     product decision above ("Investment-related fees/taxes can remain
--     real expenses under appropriate categories").
--   קצבאות וביטוח לאומי (Benefits & National Insurance / Bituach Leumi) —
--     an income-side gap: a very common non-salary Israeli household
--     income source with no existing category to land in.
INSERT INTO categories (name_he, name_en, icon, is_income, is_system, sort_order)
SELECT v.name_he, v.name_en, v.icon, v.is_income, TRUE, v.sort_order
FROM (VALUES
  ('ארנונה',                    'Municipal Tax (Arnona)',      '🏛️', FALSE, 24),
  ('עמלות ותשלומים פיננסיים',   'Bank & Financial Fees',        '💳', FALSE, 25),
  ('קצבאות וביטוח לאומי',       'Benefits & National Insurance', '🏦', TRUE,  26)
) AS v(name_he, name_en, icon, is_income, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM categories WHERE categories.name_he = v.name_he AND categories.is_system = TRUE
);
