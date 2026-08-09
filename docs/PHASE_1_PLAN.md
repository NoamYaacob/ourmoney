# MVP-1 Implementation Plan — Foundation & Auth

**Goal:** Two users can sign up, form a household, and arrive at a shared empty dashboard.
No financial data is entered in this phase.

**Output:** Buildable Expo app, live Supabase schema, passing RLS tests, working auth + household flow.

Milestones are ordered by dependency, not by date. Milestone N+1 begins when N's output exists.

> **Scope reminder.** This phase builds authentication and household formation. It builds no
> financial features, no engines, no AI, no bank connections, and no notifications beyond the
> event/router seam. See [ADR-021](DECISIONS.md#adr-021).

---

## Milestone 0 — Styling stack verification (gate)

**This blocks everything else.** [ADR-011](DECISIONS.md#adr-011) selects NativeWind v4 provisionally,
based on documentation rather than a working build. Verify before committing to it.

On a scratch Expo SDK 57 project with NativeWind ≥ 4.2.0, confirm:

- [ ] `npx expo run:ios` builds and runs
- [ ] `npx expo run:android` builds and runs
- [ ] No peer-dependency warnings involving `react-native-reanimated`
- [ ] Tailwind classes apply to a basic component
- [ ] The `dark:` variant responds to system theme changes
- [ ] RTL variants render correctly with `I18nManager.forceRTL(true)`
- [ ] Hebrew text in a styled component renders right-to-left without manual overrides

**If every box is checked:** proceed with NativeWind. Update ADR-011 to `Accepted`.

**If any box fails:** abandon NativeWind. Use React Native `StyleSheet` with a typed theme object in
`constants/theme.ts`. Write a new ADR recording what failed. The `components/ui/` API is identical
either way, so no downstream task changes.

Discard the scratch project afterwards.

---

## Milestone 1 — Project Scaffold

### 1.1 Expo App Initialization

```bash
npx create-expo-app ourmoney --template expo-template-blank-typescript
cd ourmoney
```

Then immediately configure:
- `tsconfig.json`: strict mode (`"strict": true`, `"noUncheckedIndexedAccess": true`)
- `.eslintrc.js`: `@typescript-eslint/recommended-type-checked` + `eslint-plugin-react-hooks`
- `.prettierrc`
- `app.json`: bundle identifiers, scheme (`ourmoney://`) for deep links

### 1.2 Expo Router

```bash
npx expo install expo-router expo-linking expo-constants expo-status-bar react-native-safe-area-context react-native-screens
```

Create the initial route structure:
```
app/
  _layout.tsx          # Root layout with auth guard + RTL bootstrap
  (auth)/
    _layout.tsx
    sign-in.tsx
    sign-up.tsx
    forgot-password.tsx
  (app)/
    _layout.tsx        # Tab navigator (tabs will be empty placeholders)
    dashboard/
      index.tsx
  onboarding/
    _layout.tsx
    create-household.tsx
    invite-partner.tsx
  invite/
    [token].tsx
```

### 1.3 RTL and i18n Bootstrap

```bash
npx expo install expo-updates
npm install react-i18next i18next
```

- In `app/_layout.tsx`: call `I18nManager.forceRTL(true)` and trigger `Updates.reloadAsync()` if not already RTL.
- Create `i18n/index.ts` initializing i18next with `he` as the default language.
- Create `i18n/locales/he.json` with MVP-1 strings (auth screens, onboarding, common).

### 1.4 NativeWind

```bash
npx expo install nativewind tailwindcss
```

- Configure `tailwind.config.js` with content paths and RTL variant.
- Wrap app in NativeWind provider.
- Create `constants/colors.ts` with semantic tokens for light and dark mode.

### 1.5 TanStack Query

```bash
npm install @tanstack/react-query
```

- Create `lib/queryClient.ts` with a default `QueryClient` config (staleTime, retry policy).
- Wrap the root layout in `QueryClientProvider`.

### 1.6 Zustand

```bash
npm install zustand
```

- Create `store/authStore.ts` (session state) — kept minimal; TanStack Query owns server data.
- Create `store/householdStore.ts` (active household ID) — used to scope queries.

File names are camelCase per [CLAUDE.md](../CLAUDE.md#file-and-export-conventions) — kebab-case is
for `.tsx` components only.

### 1.7 Event and notification seam

Small in implementation, load-bearing in architecture. See
[ADR-013](DECISIONS.md#adr-013) and [ADR-014](DECISIONS.md#adr-014).

**`lib/events/types.ts`** — declare the *full* event vocabulary from
[ARCHITECTURE.md](ARCHITECTURE.md#event-vocabulary), including events with no subscribers yet
(`income.received`, `bank.connected`, `mortgage.refinance_opportunity_detected`, …). Naming them
now is the point; they cost one type definition each.

**`lib/events/dispatcher.ts`** — a synchronous `emit()` that iterates registered handlers:

```ts
export function emit<T extends EventType>(event: DomainEvent<T, PayloadFor<T>>): void
```

Handler errors are caught and logged, never rethrown — a failed handler must not roll back a write.
**No queue, no broker, no persistence.**

**`lib/notifications/router.ts`** — receives events, resolves recipients and channels.
In this phase it has one subscriber and one channel.

**`lib/notifications/channels/push.ts`** — `expo-notifications`. Registered but idle; there are no
financial events to notify about yet.

MVP-1 emits exactly one real event: `household.member_joined`.

---

## Milestone 2 — Supabase Schema

### 2.1 Supabase CLI Setup

```bash
npm install -g supabase
supabase login
supabase init
supabase start  # starts local Postgres + Auth + Studio
```

### 2.2 Migration 001

Write `supabase/migrations/001_initial_schema.sql` containing (in order):

Order matters: **helper functions before the policies that call them, and tables before the helpers
that query them.** Trigger functions come first because the tables' `updated_at` triggers reference
them.

1. `update_updated_at()` function
2. `handle_new_user()` function + trigger — **with `SET search_path`**
3. `profiles` table + `updated_at` trigger
4. `households` table + `updated_at` trigger
5. `household_members` table + `idx_household_members_user` index
6. `invitations` table + indexes
7. `is_household_member()` helper — `SECURITY DEFINER`, `SET search_path = public, pg_temp`
8. `is_household_admin()` helper — `SECURITY DEFINER`, `SET search_path = public, pg_temp`
9. `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` on all four tables
10. All RLS policies (they call the helpers from steps 7–8)
11. `create_household()` RPC + `REVOKE`/`GRANT`
12. `accept_invitation()` RPC + `REVOKE`/`GRANT`

> **Why this order:** `is_household_member()` queries `household_members`, and the `households`
> policies call `is_household_member()`. Creating a policy before its helper fails outright.
> Creating all four tables first, then the helpers, then every policy, is the ordering that applies
> cleanly on an empty database. Steps 1–2 precede the tables because the `updated_at` triggers
> attached in steps 3–4 reference `update_updated_at()`.
>
> `household_members` gets **no INSERT and no UPDATE policy** — this is deliberate and
> security-critical. See [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md#household_members).
>
> Copy `create_household` and `accept_invitation` verbatim from
> [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md#create_household). Every clause in `accept_invitation`
> satisfies a condition in [ADR-010](DECISIONS.md#adr-010) and is covered by a test. Do not simplify
> it — in particular, the ADR-020 check must stay **before** token validation, or it becomes an
> oracle for token validity.

Only MVP-1 tables are created. Financial tables (`accounts`, `transactions`, `categories`,
`budgets`, `recurring_transactions`, `savings_goals`) come in migration 002 during MVP-2.

Apply:
```bash
supabase db push
```

### 2.3 Generate TypeScript Types

```bash
supabase gen types typescript --local > types/database.ts
```

Commit `types/database.ts`. This file is never edited by hand.

### 2.4 Supabase Client

Create `lib/supabase/client.ts`:

```ts
import { createClient } from '@supabase/supabase-js'
import * as SecureStore from 'expo-secure-store'
import type { Database } from '@/types/database'

const ExpoSecureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
}

export const supabase = createClient<Database>(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      storage: ExpoSecureStoreAdapter,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  }
)
```

Create `.env` (gitignored) and `.env.example` (committed):
```
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
```

### 2.5 RLS Security Tests

Write `supabase/rls_tests.sql` implementing the test groups specified in
[DATABASE_SCHEMA.md](DATABASE_SCHEMA.md#rls-security-tests).

For MVP-1, implement the groups that apply to tables that exist now:

| Group | Coverage | MVP-1 scope |
|---|---|---|
| 1 — Cross-household isolation | tests 1.12–1.14 only (`invitations`, `household_members`, `households`) | partial — 1.1–1.11 need financial tables, added in MVP-2 |
| 2 — Unaffiliated user | tests 2.1, 2.6 only | partial — rest need financial tables |
| 3 — Role enforcement | tests 3.3, 3.4, 3.7, 3.8 only | partial — 3.1, 3.2, 3.5, 3.6 need financial tables |
| 3b — Membership tampering | all 8 tests | **full — non-negotiable** |
| 3c — `create_household` | all 7 tests | **full — non-negotiable** |
| 5 — `accept_invitation` hardening | all 18 tests | **full — non-negotiable** |
| 6 — Structural guards | all 7 tests | **full** |

Groups 1, 2, and 3 are completed in MVP-2 as each financial table lands.

Groups 3b, 3c, 5, and 6 must be complete now — they cover the two `SECURITY DEFINER` functions and
the membership table, which is the entire authorization foundation. Structural guards 6.3–6.7 will
automatically fail any future migration that adds a table without RLS or a definer function without
a fixed `search_path`.

Fixtures: Household 1 (User A admin, User B member), Household 2 (User C admin), User D (no household).

Each test block runs in a transaction that rolls back after asserting.

Run:
```bash
supabase db test supabase/rls_tests.sql
```

**Milestone 2 is not complete until this passes**, including all 18 `accept_invitation` tests.

---

## Milestone 3 — Authentication

### 3.1 Dependencies

```bash
npx expo install expo-secure-store expo-local-authentication
npm install @supabase/supabase-js
```

### 3.2 Auth Context

Create `features/auth/hooks/useAuth.ts`:
- Subscribes to `supabase.auth.onAuthStateChange`
- Exposes `session`, `user`, `isLoading`

Create `hooks/useAuth.ts` re-exporting from the feature hook (app-wide convenience).

### 3.3 Auth Guard

In `app/_layout.tsx`:
- Listen to auth state via `useAuth()`
- If no session → redirect to `/(auth)/sign-in`
- If session but no household → redirect to `/onboarding/create-household`
- If session and household → allow `/(app)/`

Redirect is done with `router.replace()` inside a `useEffect` that watches the auth state.

### 3.4 Sign-Up Screen (`app/(auth)/sign-up.tsx`)

Fields:
- Display name (stored in `raw_user_meta_data`, picked up by the `handle_new_user` trigger)
- Email
- Password (min 8 characters)
- Password confirmation

On submit:
```ts
supabase.auth.signUp({ email, password, options: { data: { display_name } } })
```

Show success message asking user to confirm their email.

### 3.5 Sign-In Screen (`app/(auth)/sign-in.tsx`)

Fields: email, password.

On submit:
```ts
supabase.auth.signInWithPassword({ email, password })
```

Link to sign-up and forgot password.

### 3.6 Forgot Password (`app/(auth)/forgot-password.tsx`)

Field: email.

On submit:
```ts
supabase.auth.resetPasswordForEmail(email, { redirectTo: 'ourmoney://reset-password' })
```

### 3.7 Biometric Re-Auth

Create `features/auth/hooks/useBiometricGuard.ts`:
- On `AppState` change from `background` to `active`, if more than 30 seconds have passed:
  - Call `LocalAuthentication.authenticateAsync()`
  - If failed → sign out
- Expose `isLocked: boolean` to render a blur overlay while locked

Register the hook in `app/(app)/_layout.tsx`.

---

## Milestone 4 — Household & Invitation

### 4.1 Household Creation (`app/onboarding/create-household.tsx`)

Field: household name (e.g. "משפחת כהן").

On submit, call the RPC — **not two client-side inserts**:

```ts
supabase.rpc('create_household', { p_name: name })
```

Two separate inserts are not atomic. If the household insert succeeds and the membership insert
fails, the result is an orphaned household whose own creator is not a member — and because
`households_select` requires membership, that row is invisible and unrecoverable to them. The RPC
does both in one transaction and sets `role = 'admin'` itself.

There is also no INSERT policy on `household_members`, so a direct client insert would be rejected
regardless.

Handle the responses: `{ok: true, household_id}`, `already_in_household`, `invalid_name`.

Create `features/household/hooks/useCreateHousehold.ts` wrapping a TanStack Query `useMutation`.
Then navigate to `onboarding/invite-partner`.

### 4.2 Invite Partner (`app/onboarding/invite-partner.tsx`)

**Token + native share sheet only. No transactional email.** See [ADR-009](DECISIONS.md#adr-009).

1. `INSERT INTO invitations (household_id, invited_by)` — the `token` column self-generates
2. Construct the deep link: `ourmoney://invite/${token}`
3. `Share.share({ message })` — opens the OS share sheet (WhatsApp, iMessage, etc.)

WhatsApp is the dominant channel in Israel, and the share sheet puts the invite directly into the
conversation the couple is already having.

The `invitations.email` column exists in the schema but stays `NULL` in this phase. Email invitations
are POST-MVP and blocked on [Q1](DECISIONS.md#open-questions).

Allow skipping ("invite later from settings"). Navigate to `/(app)/dashboard`.

### 4.3 Invitation Acceptance (`app/invite/[token].tsx`)

Deep-link landing target.

On mount:
1. Extract `token` from route params
2. Call `supabase.rpc('accept_invitation', { p_token: token })`

**The RPC is specified in [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md#accept_invitation).**
Implement it verbatim — every clause satisfies a condition in [ADR-010](DECISIONS.md#adr-010) and is
covered by a test in Group 5. Do not simplify it.

Handle the response cases:

| Response | UI behavior |
|---|---|
| `{ok: true, already_member: false}` | Store `household_id`, emit `household.member_joined`, go to dashboard |
| `{ok: true, already_member: true}` | Store `household_id`, go to dashboard silently — tapping twice is not an error |
| `{ok: false, error: 'already_in_household'}` | Explain the one-household-per-user limit ([ADR-020](DECISIONS.md#adr-020)) |
| `{ok: false, error: 'invalid_invitation'}` | Generic "this invitation is no longer valid" — the server deliberately does not distinguish expired / used / nonexistent |
| `{ok: false, error: 'unauthenticated'}` | Should not occur behind the auth guard; treat as a bug |

If not signed in when the link opens:
- Store the token in `expo-secure-store`
- Route to sign-in / sign-up
- After successful auth, consume the stored token and clear it

### 4.4 Household Store

Create `store/householdStore.ts` using Zustand:
```ts
interface HouseholdStore {
  householdId: string | null
  setHouseholdId: (id: string | null) => void
}
```

On app launch, load the household ID from user's `household_members` row.

Create `hooks/useHousehold.ts`:
```ts
// Fetches the user's household from DB on mount and populates the store
// Returns { householdId, household, isLoading, error }
```

---

## Milestone 5 — Navigation Skeleton & Shared UI

### 5.1 Tab Navigator

`app/(app)/_layout.tsx` — bottom tab bar with:
- Dashboard (placeholder content)
- Transactions (empty list)
- Budgets (empty)
- Settings (profile + sign out)

Tab icons: use `@expo/vector-icons` (Ionicons).

All tabs are RTL: icon and label positioning respect `I18nManager.isRTL`.

### 5.2 Settings Screen (Partial)

For MVP-1, Settings shows:
- Profile (display name, email — read only for now)
- Household section: name and member list (uses Realtime to stay live)
- Invite partner button (re-opens the invite flow)
- Appearance: dark / light mode toggle
- Security: biometric toggle
- Sign out button

### 5.3 Dark / Light Mode

- Use Expo's `useColorScheme()` for system preference detection.
- User override stored in `expo-secure-store` (`'appearance_mode'` key).
- Color changes come from the NativeWind `dark:` variant, or from the theme object if Milestone 0
  rejected NativeWind.
- Create a `useTheme()` hook that merges system + user preference.

### 5.4 Shared Component Library (minimum for this phase)

Build only what these screens actually need. The component API must be identical regardless of the
Milestone 0 styling outcome, so that the decision does not leak into feature code.

```
components/ui/
  Button.tsx       # primary, secondary, ghost variants
  Input.tsx        # text input with label, error state, RTL support
  Card.tsx         # surface container
  Divider.tsx
  Avatar.tsx       # profile image with initials fallback
  LoadingSpinner.tsx
  ErrorMessage.tsx
  Screen.tsx       # SafeAreaView wrapper with standard padding
```

---

## Exit Criteria

### Build and types
- [ ] Milestone 0 styling verification complete; ADR-011 resolved to `Accepted` or superseded
- [ ] `tsc --noEmit` passes with zero errors
- [ ] No `any` types anywhere in the codebase
- [ ] iOS and Android both build and run

### Database
- [ ] `001_initial_schema.sql` applies cleanly to an empty database
- [ ] `types/database.ts` regenerated and committed
- [ ] Both RLS helpers have a fixed `search_path`
- [ ] Every table created has RLS enabled and at least one policy

### Security — blocking
- [ ] `supabase/rls_tests.sql` passes in full
- [ ] All 18 `accept_invitation` tests pass (Group 5)
- [ ] All 8 membership-tampering tests pass (Group 3b)
- [ ] All 7 `create_household` tests pass (Group 3c)
- [ ] Structural guards 6.3–6.7 pass
- [ ] `household_members` has no INSERT and no UPDATE policy
- [ ] Every `SECURITY DEFINER` function has a fixed `search_path` and is granted to `authenticated` only
- [ ] No service role key appears anywhere in client code
- [ ] Session tokens are in `expo-secure-store`, not AsyncStorage

### Functional
- [ ] User A signs up, creates a household, reaches the dashboard
- [ ] User A shares an invite link via the OS share sheet
- [ ] User B taps the link, signs up, and joins User A's household
- [ ] Both users see each other in the Settings member list
- [ ] Tapping an already-accepted invite link lands in the household without an error
- [ ] An expired invite shows the generic invalid-invitation message
- [ ] Biometric lock triggers on resume after 30+ seconds backgrounded

### Architecture conformance
- [ ] `lib/events/types.ts` declares the full vocabulary, including future events
- [ ] `household.member_joined` is emitted on acceptance
- [ ] No domain module imports from `lib/notifications/channels/`
- [ ] `grep -ri "whatsapp" features/ app/ lib/ --exclude-dir=notifications` returns zero results
- [ ] No message broker, queue, or pub/sub dependency in `package.json`

### Localization and theming
- [ ] All UI text renders in Hebrew, RTL, on both platforms
- [ ] No hardcoded Hebrew strings outside `i18n/locales/he.json`
- [ ] Dark and light mode both render without defects

---

## Dependencies

Versions are pinned at scaffold time against the Expo SDK selected in Milestone 0.
`npx expo install` resolves Expo-managed packages to SDK-compatible versions — use it rather than
`npm install` for anything `expo-*`.

```
expo                          SDK 57 (verify at scaffold — ADR-011)
expo-router
expo-secure-store
expo-local-authentication
expo-notifications
expo-updates
expo-linking
@expo/vector-icons
@supabase/supabase-js
@tanstack/react-query         ^5
zustand                       ^4
react-i18next
i18next
nativewind                    >=4.2.0   (provisional — Milestone 0 gate)
tailwindcss                   ^3        (provisional — paired with NativeWind v4)
```

`nativewind` and `tailwindcss` are dropped entirely if Milestone 0 fails.

---

## Explicitly NOT in this phase

**Financial** — no accounts, transactions, categories, budgets, recurring, goals, CSV import,
or analytics. Those are MVP-2 and MVP-3.

**Notifications** — the event dispatcher and notification router exist as seams, and the push
channel is registered, but no financial notification fires. There is nothing to notify about yet.

**Intelligence** — no engines, no Safe-to-Spend, no health score, no benchmarks, no AI.
`lib/engines/` does not exist.

**Integrations** — no Open Banking, no WhatsApp, no transactional email, no LLM.

**Permissions** — `role IN ('admin','member')` only. No `member_type`, no `visibility` column, no
grant table, no per-member filtering. Every member sees every row
([ADR-029](DECISIONS.md#adr-029)).

**Speculative columns** — none. No installment, charge-date or visibility columns land in migration
001 or 002. Forward-compatibility comes from the transaction identity invariants, not from unused
storage ([ADR-029](DECISIONS.md#adr-029)).

**Infrastructure** — no server layer, no message broker, no monorepo tooling.
