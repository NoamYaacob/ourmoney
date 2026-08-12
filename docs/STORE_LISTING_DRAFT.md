> ## ⚠️ DRAFT — NOT YET SUBMITTED
>
> Working draft prepared during Milestone 12 ("Release / Submission Readiness"). Not yet entered
> into App Store Connect or Google Play Console, not yet reviewed by either platform. Every
> placeholder is marked explicitly. This draft is written in English for internal review; the app's
> UI is Hebrew-only as of this version (`CLAUDE.md`), so **the final listing copy submitted to both
> stores should be in Hebrew** — a professional or native-speaker translation pass of the copy below
> is required before submission, this is not it.
>
> Every feature claim below is checked against `docs/PROJECT_SPEC.md`'s shipped feature list. Nothing
> here describes a planned or future capability.

# OurMoney — Store Listing Draft

## App name

**OurMoney** (working title — subject to a name-uniqueness check on both stores, which this
document cannot perform)

## Short description (App Store subtitle / Play Store short description, ~80 char limit)

> Track shared spending together, in Hebrew — no bank connection needed.

Hebrew draft (needs native review): *ניהול תקציב משותף לזוגות — בלי חיבור לבנק*

## Full description

> **OurMoney is a budgeting app built for couples and households, in Hebrew.**
>
> Log your spending together — from the supermarket run to who paid for dinner — and see it all in
> one shared dashboard. No bank connection required: enter transactions manually or import your
> bank's CSV export, and you're in control of exactly what OurMoney knows.
>
> **Built for two.** Invite your partner with one tap. You each get your own login, your own
> transactions, and a shared view of where your household's money goes.
>
> **Categorization that explains itself.** Set up rules once — "anything from Rami Levy is
> groceries" — and every future purchase categorizes itself. See exactly which rule matched, and fix
> it in one tap if it's wrong.
>
> **A real budget, not a guess.** Set a monthly amount per category and watch your progress in real
> time. Your partner's purchases show up within seconds.
>
> **Cash counts too.** Logging a cash purchase is exactly as fast as logging a card purchase — no
> second-class way to track money.
>
> **Your data stays yours.** OurMoney never sells or shares your financial data. No ads. No bank
> credentials stored — because we never connect to your bank at all.
>
> Import your recent transactions from a CSV file, set up recurring bills so you never forget rent
> or a subscription, track savings goals, and see simple monthly trends — all in Hebrew, right to
> left, built for how you actually use your phone.

## Main features (for the feature-bullet section, per store)

- Manual transaction entry, in seconds — cash and card alike
- CSV import from your bank's export, with duplicate detection
- Shared household budgeting with real-time partner sync
- Editable, transparent categorization rules — see and fix exactly why something was categorized
- Monthly category budgets with live spent/remaining progress
- Recurring transaction templates (rent, subscriptions, bills)
- Savings goals with progress tracking
- Basic spending analytics — monthly trend, top categories, income vs. expense
- Dark mode and light mode
- Full Hebrew, right-to-left interface
- Biometric app lock

## Intended audience

Adults (couples and households) managing shared household finances. Not directed at children.

## Category recommendation

- **App Store:** Finance
- **Google Play:** Finance

## Keywords / search terms (draft — needs Hebrew equivalents and ASO review)

תקציב, ניהול כספים, תקציב משותף, זוגות, הוצאות, חיסכון — *budget, household finance, couples budget,
expense tracking, savings, Hebrew budgeting app*

## Age-rating considerations

No objectionable content, no user-generated public content, no social/chat features between
strangers (invitations are one-to-one, closed-household only), no in-app purchases as of this
version, no gambling, no user-to-user messaging within the app itself. Expected rating: **4+ / iOS
"Everyone"** and **Google Play "Everyone"** — final answer is a store-questionnaire outcome, not
something this document can certify (see `docs/RELEASE_CHECKLIST.md` §4/§5).

## In-app account creation/deletion notes

Both stores require this to be disclosed accurately:

- **Account creation:** email + password, in-app, via Supabase Auth. No social sign-in options in
  this version.
- **Account deletion:** available in-app, Settings → Delete Account. Meets Apple's Guideline 5.1.1(v)
  and Google Play's account-deletion requirement — this was the explicit purpose of Milestone 9
  (ADR-032). The deletion behavior (household succession, data retention for remaining members) is
  documented in full in `docs/PRIVACY_POLICY.md` §8.

## Privacy/data-safety notes (for Apple's "App Privacy" and Google's "Data Safety" forms)

Drawn directly from `docs/PRIVACY_POLICY.md` — the two forms must not diverge from what that
document says. Concretely:

- **Data collected:** email address, password (hashed), display name, optional avatar, financial
  data you enter (accounts, transactions, categories, budgets, goals), device/technical data via
  Sentry crash reporting only.
- **Data linked to your identity:** account/profile data, financial data (scoped to your household).
- **Data used for tracking:** none. No advertising identifier is collected. No cross-app or
  cross-site tracking.
- **Third parties data is shared with:** Supabase (hosting/database/auth), Sentry (crash reporting
  only, financial/identifying data stripped before transmission — see ADR-033). No advertising or
  analytics network.
- Filling in the actual App Store Connect / Play Console forms is a manual, external step — this
  section is source material for that step, not the form submission itself.

## Support URL

[SUPPORT URL REQUIRED] — both stores require a live support contact. Options: a hosted support
email, a simple static support page, or a GitHub issues link if the repository is made public.
Not yet decided.

## Privacy-policy URL

[PUBLIC POLICY URL REQUIRED] — must point to a published, hosted version of
`docs/PRIVACY_POLICY.md` once finalized (see `docs/RELEASE_CHECKLIST.md` §9). A file living only in
this git repository does not satisfy either store's requirement.

## Marketing URL (optional)

[MARKETING URL — OPTIONAL, NOT YET DECIDED]

## Screenshot plan

Both stores require real, on-device screenshots — this repository cannot generate them (`expo
export` produces a JS bundle, not rendered UI). Suggested capture list, matching `PROJECT_SPEC.md`'s
actual shipped screens:

1. **Dashboard** — monthly summary card + budget progress bars + recent transactions. Caption
   (draft): "See your whole household's money, together."
2. **Add transaction** — the FAB/quick-add flow with the shared/personal toggle visible. Caption:
   "Log a purchase in seconds — cash or card."
3. **Categorization rule** — the "create rule from an uncategorized transaction" flow. Caption: "See
   exactly why something was categorized — and fix it in one tap."
4. **Budgets** — the monthly allocation editor with progress bars. Caption: "Set a budget. Watch it
   update in real time."
5. **Transactions list** — filterable list showing both partners' entries. Caption: "Everything in
   one shared view."
6. (Optional) **Onboarding — invite partner** screen. Caption: "Invite your partner in one tap."
7. (Optional) **Dark mode** variant of the dashboard, to show the theme option.

Capture on a real device (§8 of `docs/RELEASE_CHECKLIST.md`) using a seeded demo household with
realistic but fake data — never a real user's real financial data.

## What this listing must NOT claim

Explicit negative list, so nothing drifts during copy revisions:

- No automatic bank sync, no Open Banking, no bank credential storage
- No WhatsApp integration or messaging
- No AI, machine learning, or "smart"/"AI-powered" categorization claims — categorization is
  rule-based and fully user-controlled
- No claim of investment tracking, net worth, credit score, or any capability outside
  `docs/PROJECT_SPEC.md`'s actual MVP scope
