# OurMoney — MVP Product Specification

> **This document specifies the MVP only.**
> The long-term product is described in [PRODUCT_VISION.md](PRODUCT_VISION.md) and the full feature
> catalogue in [FEATURES.md](FEATURES.md). Neither expands what is specified here.
> If a requirement is not in this document, it is not in the MVP.

## What the MVP is

OurMoney is a shared budgeting app for households, designed first and foremost for Israeli couples.
It is the app you open together at the end of the month — or quickly on your own when you need
to log a purchase before you forget it.

The design optimizes for the two-partner household while the database and auth model support any
number of members. Every member sees everything; richer visibility is POST-MVP
([ADR-019](DECISIONS.md#adr-019)).

## What the MVP becomes

The long-term product is a **Financial Operating System for Israeli households** — one that answers
"what should we do next?" rather than "where did the money go?"

That matters here for exactly one reason: it dictates that the MVP models a *household* rather than
a couple, stores money as integers, and keeps its domain logic free of delivery channels and AI.
It does not add a single feature to this specification. See [ADR-021](DECISIONS.md#adr-021).

---

## Target User

Primary: Israeli couples aged 25–45 who:
- Have at least two income sources between them
- Spend from both personal and shared accounts
- Want to agree on a budget and track it together
- Use their phones primarily in Hebrew
- May not have accounting or budgeting experience

The UI must be usable without reading instructions. If a user needs to read a tooltip to understand
a core action, the UX has failed.

---

## Non-Goals for MVP

Explicitly out of scope. Several of these are headline long-term features — their presence in
[FEATURES.md](FEATURES.md) does not make them MVP scope.

**Integrations**
- Bank account synchronization (Open Banking)
- Importing directly from Israeli bank apps
- WhatsApp notifications or assistant
- Transactional email (invitations use the native share sheet)
- Any LLM or AI capability

**Financial intelligence** — the entire category
- Safe-to-Spend, cash-flow forecasting, committed-expense modeling
- Financial health score
- Household spending benchmarks
- Automatic budget generation
- Emergency fund planning
- Net worth tracking
- Debt, mortgage, pension, or insurance modeling
- Refinancing or payoff simulators
- Tax, benefit, or eligibility determination
- Action Engine / recommendations
- What-if simulation, Financial Twin

**Product**
- Member types beyond admin/member; per-member visibility rules
- Multiple households per user
- Investment portfolio tracking
- Multi-currency with live conversion
- Business / self-employment expense tracking
- Envelope budgeting or sub-accounts
- Bill splitting with people outside the household (Splitwise-style)
- Social or comparison features

**Infrastructure**
- Server-side API layer
- Message broker or durable event queue
- Monorepo tooling

---

## Core User Flows

### 1. Onboarding

```
Download app
→ Sign up with email
→ Create household (name the household)
→ Invite partner (share link via WhatsApp, iMessage, …)
→ Partner accepts via deep link
→ Both land on shared dashboard
```

### 2. Daily Transaction Logging

```
Open app → Transactions tab
→ Tap "+" (add transaction)
→ Enter amount (agorot-accurate)
→ Choose account
→ Choose category (or leave uncategorized)
→ Toggle shared / personal
→ Optionally add a note
→ Save
→ Partner sees it appear in real time
```

### 3. Monthly Budget Setup

```
Budgets tab → "Set up this month's budget"
→ Select categories to budget
→ Enter amount per category (in ILS, stored as agorot)
→ Save
→ Dashboard shows progress bars per category
```

### 4. Category Rule Creation

```
Uncategorized transaction → Tap "Create rule"
→ Match field: description / merchant name
→ Match operator: contains / equals / starts_with
→ Enter value
→ Assign category
→ App retroactively applies rule to existing uncategorized transactions (optional)
```

### 5. Partner Invitation

```
Settings → Household → Invite partner
→ App generates an invitation token
→ Native share sheet opens (WhatsApp, iMessage, …)
→ Partner opens the link on their phone → app opens (or App Store)
→ Partner signs in / signs up
→ accept_invitation RPC validates and joins them to the household
```

---

## Screen Inventory

### Auth Group
- Sign In
- Sign Up
- Forgot Password / Password Reset

### Onboarding Group
- Create Household
- Invite Partner

### Invite Handler
- Accept Invitation (deep link target)

### App (Tab Bar)
1. Dashboard
2. Transactions
3. Add Transaction (FAB, not a tab)
4. Budgets
5. Settings

### Dashboard
- Monthly summary card (income / expenses / net)
- Budget progress bars per category
- Recent transactions (last 5, from all household members)

### Transactions
- List (filterable by account, category, date range, shared/personal)
- Transaction detail / edit
- Add transaction form
- CSV import flow (select file → preview → confirm → import)

### Budgets
- Monthly budget overview
- Per-category allocation editor
- Uncategorized transactions view
- Category rules list + editor

### Accounts
- Account list
- Add account form
- Account detail (transaction list for that account)

### Goals (Savings)
- Goal list
- Add / edit goal form
- Goal detail with progress

### Settings
- Profile (display name, avatar)
- Household (name, members, invite)
- Categories (manage custom categories)
- Recurring transactions (list + editor)
- Accounts (list, add, edit — reached from here, not a tab)
- Savings goals (reached from here, not a tab)
- Notifications (single on/off toggle for budget alerts — per-event preferences are POST-MVP)
- Appearance (dark / light / system — no language toggle; Hebrew only in MVP)
- Security (biometric toggle)
- Sign out
- Delete account (required for App Store / Play Store compliance)

---

## Feature Requirements

### Authentication
- Email + password sign-up and sign-in
- Password reset via email
- Session persists across app launches (secure storage)
- Biometric re-auth after app is backgrounded > 30 seconds
- Sign out clears session from secure storage

### Household
- Create a household with a name
- One user is the admin; invited members are members
- Admin can rename the household
- Admin can remove a member
- Members can leave a household
- A user can only be in one household at a time (MVP constraint)

### Partner Invitation
- Invite by shareable deep link via the native share sheet (WhatsApp, iMessage, etc.)
- No transactional email in MVP — the `invitations.email` column exists but stays `NULL`
  ([ADR-009](DECISIONS.md#adr-009))
- Invitation token expires after 7 days
- Recipient must be signed in or sign up to accept
- Invitations table tracks status (pending / accepted / expired / cancelled)
- Acceptance goes through the hardened `accept_invitation` RPC ([ADR-010](DECISIONS.md#adr-010)):
  atomic, single-use, expiry-checked, concurrency-safe, and non-disclosing on failure
- Tapping an already-accepted link is not an error — the user lands in the household

### Accounts
- Manual account types: checking, savings, credit card, cash, investment, other
- Account has a name, type, currency (ILS default), color, icon
- Account can be marked as shared (household) or personal (one member)
- Balance is stored as agorot and displayed in ILS
- Account can be archived (excluded from totals) but not deleted if it has transactions

### Transactions
- Amount in ILS entered by user (app stores as agorot: `Math.round(ils * 100)`)
- Date (defaults to today)
- Account (required)
- Category (optional at creation; uncategorized transactions surface in UI)
- Description / merchant name
- Shared vs personal toggle
- Note (free text)
- Source: manual, csv_import, recurring
- Soft delete only (is_excluded flag for excluding from calculations)

### Categories
- System categories are seeded and available to all households (Hebrew labels)
- Households can create custom categories
- Categories have Hebrew name, optional English name, emoji icon, color
- Categories can be income or expense type
- System categories cannot be deleted; custom categories can (admin only)
- The `parent_id` column exists in the schema but is unused in MVP — sub-categories are POST-MVP

### Category Rules
- Rules match on `description` or `merchant_name`
- Operators: contains, equals, starts_with (case-insensitive by default)
- Multiple rules per category; MVP evaluates them in creation order
- The `sort_order` column exists but user-controlled priority is POST-MVP
- Rules run on new transactions at creation time and on import
- Rules can be applied retroactively to uncategorized transactions (user-triggered)

### Budgets
- Monthly budgets (period_start = first day, period_end = last day)
- One budget per household per month
- Budget is a collection of per-category allocations
- Dashboard shows spent / remaining per category as progress bars

**Spent and remaining — exact definition.** Expenses are stored as *negative* agorot
([DATABASE_SCHEMA.md](DATABASE_SCHEMA.md)), so the sign must be handled explicitly:

```
spent_agorot     = −SUM(amount_agorot)
                   WHERE household_id = :household
                     AND category_id  = :category
                     AND txn_date BETWEEN period_start AND period_end
                     AND is_shared   = TRUE
                     AND is_excluded = FALSE

remaining_agorot = allocation_agorot − spent_agorot
```

Negating the sum makes `spent_agorot` positive for ordinary spending, so `remaining_agorot` goes
*down* as money is spent and turns negative when over budget. Getting this backwards is an easy and
very visible bug — it must be covered by a unit test with a known fixture.

Transactions with `is_excluded = TRUE` never count. Personal (`is_shared = FALSE`) transactions
never count toward household budgets.

### Recurring Transactions
- Define a template: account, category, amount, description, shared/personal, frequency
- Frequencies: daily, weekly, biweekly, monthly, quarterly, yearly
- `next_due_date` field; a background check (or on-app-open) creates the transaction if due
- Recurring transactions get `source = 'recurring'` and `recurring_id` link
- User can skip a single occurrence without deleting the template

### CSV Import
- User selects a CSV file from the device
- App parses and previews transactions (date, description, amount, debit/credit)
- User confirms or deselects individual rows
- Import runs category rules before saving
- Duplicate detection: same account + same date + same amount + same description = flagged, not imported (user can override)
- Source is set to `csv_import`

### Savings Goals
- Name, target amount (agorot), optional target date, optional linked account
- Progress: `current_agorot` updated manually
- Visual progress bar showing current vs target
- Mark as completed
- Pace projection ("14 months at this rate") and auto-progress from a linked account are POST-MVP

### Dashboard
- Current month by default, navigable to previous months
- Total household income vs expenses
- Budget progress per category (only categories with an allocation)
- Quick-add button (FAB)
- Recent transactions from all household members
- Net savings for the month

### Analytics
"Basic" is the operative word — three views, no more:

- Monthly bar chart: income vs expenses per month (last 6 months)
- Category donut chart for the selected month
- Top spending categories ranked

Month-over-month per-category comparison, custom date ranges, and any form of trend analysis are
POST-MVP.

### RTL Hebrew UI
- All text renders RTL
- All Hebrew strings in `i18n/locales/he.json`
- Numbers, currency, and dates formatted with `he-IL` locale
- Date format: DD/MM/YYYY (Israeli standard)

### Dark / Light Mode
- Follows system preference by default
- User can override in Settings → Appearance
- All colors come from semantic theme tokens via NativeWind `dark:` variants; no hardcoded hex
  values in components ([ADR-011](DECISIONS.md#adr-011))

### Security
- RLS on all financial tables (see [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md))
- RLS tests prove cross-household isolation
- Tokens in expo-secure-store
- Biometric guard on app resume

---

## Hebrew Category Seed Data

System categories (available to all households, cannot be deleted):

| Hebrew Name | English Name | Icon | Income |
|---|---|---|---|
| מזון וסופרמרקט | Food & Groceries | 🛒 | no |
| מסעדות ובתי קפה | Restaurants & Cafes | ☕ | no |
| דיור ושכירות | Housing & Rent | 🏠 | no |
| תחבורה | Transportation | 🚗 | no |
| בריאות ורפואה | Health & Medical | 💊 | no |
| חינוך | Education | 📚 | no |
| בידור ופנאי | Entertainment | 🎬 | no |
| קניות | Shopping | 🛍️ | no |
| ספורט וכושר | Sports & Fitness | 🏋️ | no |
| תקשורת | Communications | 📱 | no |
| ביטוח | Insurance | 🛡️ | no |
| חיות מחמד | Pets | 🐾 | no |
| חופשה ונסיעות | Vacation & Travel | ✈️ | no |
| מתנות ותרומות | Gifts & Donations | 🎁 | no |
| שירותים | Utilities | ⚡ | no |
| טיפול אישי | Personal Care | 💆 | no |
| ילדים | Children | 👶 | no |
| אחר | Other | 📦 | no |
| משכורת | Salary | 💼 | yes |
| בונוס | Bonus | 🎉 | yes |
| פרילנס | Freelance | 💻 | yes |
| השקעות | Investments | 📈 | yes |
| אחר - הכנסה | Other Income | 💰 | yes |
