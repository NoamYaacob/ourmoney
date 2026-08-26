# Design QA mode

A local, development-only way to run the real app against Claude Design's
own mock data instead of Supabase — for comparing a screen's actual
rendering to `OurMoney - Desktop.dc.html` / `OurMoney - Mobile.dc.html`
without a Supabase project, credentials, or network access.

## What it is

`dev/designQaClient.ts` is a drop-in stand-in for `lib/supabase/client.ts`.
It implements the same `supabase.auth.*` / `supabase.from(...)` / `.rpc(...)`
surface the app calls, backed by an in-memory dataset instead of a real
Postgres connection. Every name, amount, date and category in that dataset
is taken from the Design files themselves (the "משפחת לוי" household,
"שופרסל דיל", "ארנונה דו־חודשית", the sofa/fridge instalment purchases,
etc.) — the goal is that a screenshot taken under Design QA mode should
look like the mockup, not just have *some* data in it.

Every real hook, TanStack Query cache, and calculation engine in the app
runs unmodified against this data — only the Supabase client itself is
swapped, so what renders is the actual product, not a reimplementation of
it.

## Modes

`DESIGN_QA=1` (the original mode) is always authenticated, with a household
and its full financial data — but that means the entire `(auth)` route group
and the onboarding flow are unreachable under it: `useAuthGuard` redirects
straight past them, every time, because there's always a session and always
a household. Four sibling modes cover the states `1` cannot reach, each its
own fixture file behind the same resolver hook, sharing the query-engine
plumbing (`createBuilder`/`createSession`) in `dev/designQaEngine.ts`:

| Mode | Session | Household | Financial data | For |
|---|---|---|---|---|
| `1` | yes | yes | full (Design-file content) | everything else |
| `signedout` | none | — | — | sign-in / sign-up / forgot-password |
| `onboarding` | yes | none | — | create-household / invite-partner |
| `empty` | yes | yes | none at all | first-time-user, right after onboarding |
| `stress` | yes | yes | 10 accounts, 20+ categories, 130+ transactions | high-volume/scrolling/perf checks |

`signedout` and `onboarding` don't fake a successful sign-in/sign-up
themselves (`signInWithPassword`/`signUp` return a "preview only" error on
`signedout`) — they exist to render the screens themselves, not to skip
past them. `onboarding`'s `create_household` RPC *is* faked as a real
success, since the whole point of that mode is to walk the actual
create-household → invite-partner flow end to end.

## Enabling it locally

```bash
DESIGN_QA=1 npx expo start --web
# or, for a static export to screenshot:
DESIGN_QA=1 npx expo export --platform web
# any other mode: DESIGN_QA=empty, DESIGN_QA=stress, DESIGN_QA=signedout, DESIGN_QA=onboarding
```

`metro.config.js` only installs the resolver hook that redirects
`lib/supabase/client.ts` → the matching `dev/designQa*Client.ts` when
`DESIGN_QA` is set to one of the modes above. A normal `expo start` /
`expo export` — including whatever command Vercel's build runs — never sets
this, so this path never runs unless a developer opts in on their own
machine.

## What it is not

- **Not production data, and never mixed with it.** `dev/designQaClient.ts`
  never imports or calls the real `lib/supabase/client.ts`; there is no
  code path that could send this dataset to a real Supabase project or pull
  real rows into it.
- **Not a seed script.** It does not write anything anywhere — it's an
  in-memory fixture that exists for exactly as long as the dev server
  process does.
- **Not authoritative for correctness.** It's for visual/structural
  comparison against the Design files. Final validation still needs the
  real Vercel + Supabase app (see the root README / CI for how that's
  covered).

## Extending it

Add rows to the `TABLES` object in the relevant `dev/designQa*Client.ts`
file, matching the real Postgres schema in `types/database.ts`
column-for-column — the fixture is only useful if the app's real
hooks/engines accept it the same way they'd accept a real Supabase
response. Prefer copying content straight from the Design files over
inventing new names; if a screen's Design frame doesn't show a concrete
example, use realistic Hebrew content consistent with what's already there
rather than a placeholder. A change to the shared query-builder behavior
(join embedding, filter semantics) belongs in `dev/designQaEngine.ts`, not
duplicated across the sibling files.
