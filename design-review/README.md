# Visual Review Screenshot Package

Full-product screenshot capture of `design/mobile-redesign` for independent design review.
Captured with Playwright against `expo export --platform web` builds run under the
`DESIGN_QA` fixture harness (see `dev/designQaClient.ts` and siblings) — never against
real Supabase data.

- **97 screenshots**, organized under `screenshots/desktop`, `screenshots/tablet`,
  `screenshots/mobile`, `screenshots/dark`.
- Fixtures used: `stress` (realistic/populated household — 10 accounts, 20+ categories,
  130+ transactions), `empty` (zero accounts, for the Credit & Payments onboarding empty
  state only), `signedout` (sign-in/up/forgot-password), `onboarding`
  (create-household/invite-partner).
- `-top` / `-bottom` pairs are genuine scroll positions (the page's own scrollable
  container scrolled to `scrollTop = 0` and to its true max), not two different fixed
  viewport heights — where a page is short, `-top` and `-bottom` will look the same,
  which is itself the honest finding (no more content exists below the fold).
- No screenshot was cropped, retimed, or re-scrolled to avoid an awkward state.

## Inventory

| Screen | Route | Viewport | Fixture / mode | Light/Dark | Screenshot | State being shown |
|---|---|---|---|---|---|---|
| Home / Dashboard | `/dashboard` | 1440x900 | stress (realistic/populated) | light | [`desktop/desktop-1440-home-top.png`](screenshots/desktop/desktop-1440-home-top.png) | Top of page, initial load |
| Home / Dashboard | `/dashboard` | 1440x900 | stress (realistic/populated) | light | [`desktop/desktop-1440-home-bottom.png`](screenshots/desktop/desktop-1440-home-bottom.png) | Scrolled to bottom of page |
| Transactions | `/transactions` | 1440x900 | stress (realistic/populated) | light | [`desktop/desktop-1440-transactions-top.png`](screenshots/desktop/desktop-1440-transactions-top.png) | Top of page, initial load |
| Transactions | `/transactions` | 1440x900 | stress (realistic/populated) | light | [`desktop/desktop-1440-transactions-table.png`](screenshots/desktop/desktop-1440-transactions-table.png) | Scrolled partway down the transaction list |
| Transactions | `/transactions` | 1440x900 | stress (realistic/populated) | light | [`desktop/desktop-1440-transactions-bottom.png`](screenshots/desktop/desktop-1440-transactions-bottom.png) | Scrolled to bottom of page |
| Transactions — Add form | `/transactions/new` | 1440x900 | stress (realistic/populated) | light | [`desktop/desktop-1440-transactions-add-form.png`](screenshots/desktop/desktop-1440-transactions-add-form.png) | Inline/full-page add form open |
| Budget | `/budgets` | 1440x900 | stress (realistic/populated) | light | [`desktop/desktop-1440-budget-top.png`](screenshots/desktop/desktop-1440-budget-top.png) | Top of page, initial load |
| Budget | `/budgets` | 1440x900 | stress (realistic/populated) | light | [`desktop/desktop-1440-budget-categories.png`](screenshots/desktop/desktop-1440-budget-categories.png) | Scrolled to category budget section |
| Budget | `/budgets` | 1440x900 | stress (realistic/populated) | light | [`desktop/desktop-1440-budget-bottom.png`](screenshots/desktop/desktop-1440-budget-bottom.png) | Scrolled to bottom of page |
| Cash Flow | `/cash-flow` | 1440x900 | stress (realistic/populated) | light | [`desktop/desktop-1440-cashflow-chart.png`](screenshots/desktop/desktop-1440-cashflow-chart.png) | Complete forecast chart, default 30-day horizon |
| Cash Flow | `/cash-flow` | 1440x900 | stress (realistic/populated) | light | [`desktop/desktop-1440-cashflow-events.png`](screenshots/desktop/desktop-1440-cashflow-events.png) | Scrolled to upcoming-events list |
| Cash Flow | `/cash-flow` | 1440x900 | stress (realistic/populated) | light | [`desktop/desktop-1440-cashflow-30day.png`](screenshots/desktop/desktop-1440-cashflow-30day.png) | 30-day horizon (default) |
| Cash Flow | `/cash-flow` | 1440x900 | stress (realistic/populated) | light | [`desktop/desktop-1440-cashflow-90day.png`](screenshots/desktop/desktop-1440-cashflow-90day.png) | 90-day horizon selected |
| Accounts | `/accounts` | 1440x900 | stress (realistic/populated) | light | [`desktop/desktop-1440-accounts-top.png`](screenshots/desktop/desktop-1440-accounts-top.png) | Top of page, initial load |
| Accounts | `/accounts` | 1440x900 | stress (realistic/populated) | light | [`desktop/desktop-1440-accounts-bottom.png`](screenshots/desktop/desktop-1440-accounts-bottom.png) | Scrolled to bottom of page |
| Accounts | `/accounts` | 1440x900 | stress (realistic/populated) | light | [`desktop/desktop-1440-accounts-add-form.png`](screenshots/desktop/desktop-1440-accounts-add-form.png) | Inline/full-page add form open |
| Accounts | `/accounts` | 1440x900 | stress (realistic/populated) | light | [`desktop/desktop-1440-accounts-add-credit-card.png`](screenshots/desktop/desktop-1440-accounts-add-credit-card.png) | Add-account form, credit_card type selected (billing-cycle field visible) |
| Credit & Payments (Installments) | `/installments` | 1440x900 | stress (realistic/populated) | light | [`desktop/desktop-1440-installments-populated.png`](screenshots/desktop/desktop-1440-installments-populated.png) | Normal populated state |
| Credit & Payments (Installments) | `/installments` | 1440x900 | empty | light | [`desktop/desktop-1440-installments-empty.png`](screenshots/desktop/desktop-1440-installments-empty.png) | Zero-credit-card onboarding empty state (DESIGN_QA=empty fixture: 0 accounts) |
| Recurring | `/recurring` | 1440x900 | stress (realistic/populated) | light | [`desktop/desktop-1440-recurring-top.png`](screenshots/desktop/desktop-1440-recurring-top.png) | Top of page, initial load |
| Recurring | `/recurring` | 1440x900 | stress (realistic/populated) | light | [`desktop/desktop-1440-recurring-price-increase.png`](screenshots/desktop/desktop-1440-recurring-price-increase.png) | Top of page — price-increase warning card visible |
| Recurring | `/recurring` | 1440x900 | stress (realistic/populated) | light | [`desktop/desktop-1440-recurring-add-form.png`](screenshots/desktop/desktop-1440-recurring-add-form.png) | Inline/full-page add form open |
| Obligations | `/obligations` | 1440x900 | stress (realistic/populated) | light | [`desktop/desktop-1440-obligations-top.png`](screenshots/desktop/desktop-1440-obligations-top.png) | Top of page, initial load |
| Obligations | `/obligations` | 1440x900 | stress (realistic/populated) | light | [`desktop/desktop-1440-obligations-add-form.png`](screenshots/desktop/desktop-1440-obligations-add-form.png) | Inline/full-page add form open |
| Goals | `/goals` | 1440x900 | stress (realistic/populated) | light | [`desktop/desktop-1440-goals-top.png`](screenshots/desktop/desktop-1440-goals-top.png) | Top of page, initial load |
| Goals | `/goals` | 1440x900 | stress (realistic/populated) | light | [`desktop/desktop-1440-goals-add-form.png`](screenshots/desktop/desktop-1440-goals-add-form.png) | Inline/full-page add form open |
| Settings | `/settings` | 1440x900 | stress (realistic/populated) | light | [`desktop/desktop-1440-settings-top.png`](screenshots/desktop/desktop-1440-settings-top.png) | Top of page, initial load |
| Settings — Categories & Rules | `/settings/categories` | 1440x900 | stress (realistic/populated) | light | [`desktop/desktop-1440-settings-categories.png`](screenshots/desktop/desktop-1440-settings-categories.png) | Settings > Categories & rules sub-page |
| Settings | `/settings` | 1440x900 | stress (realistic/populated) | light | [`desktop/desktop-1440-settings-bottom.png`](screenshots/desktop/desktop-1440-settings-bottom.png) | Scrolled to bottom of page |
| Home / Dashboard | `/dashboard` | 1920x900 | stress (realistic/populated) | light | [`desktop/desktop-1920-home-top.png`](screenshots/desktop/desktop-1920-home-top.png) | Top of page, initial load |
| Transactions | `/transactions` | 1920x900 | stress (realistic/populated) | light | [`desktop/desktop-1920-transactions-top.png`](screenshots/desktop/desktop-1920-transactions-top.png) | Top of page, initial load |
| Budget | `/budgets` | 1920x900 | stress (realistic/populated) | light | [`desktop/desktop-1920-budget-top.png`](screenshots/desktop/desktop-1920-budget-top.png) | Top of page, initial load |
| Cash Flow | `/cash-flow` | 1920x900 | stress (realistic/populated) | light | [`desktop/desktop-1920-cashflow-top.png`](screenshots/desktop/desktop-1920-cashflow-top.png) | Top of page, initial load |
| Accounts | `/accounts` | 1920x900 | stress (realistic/populated) | light | [`desktop/desktop-1920-accounts-top.png`](screenshots/desktop/desktop-1920-accounts-top.png) | Top of page, initial load |
| Credit & Payments (Installments) | `/installments` | 1920x900 | stress (realistic/populated) | light | [`desktop/desktop-1920-installments-top.png`](screenshots/desktop/desktop-1920-installments-top.png) | Top of page, initial load |
| Recurring | `/recurring` | 1920x900 | stress (realistic/populated) | light | [`desktop/desktop-1920-recurring-top.png`](screenshots/desktop/desktop-1920-recurring-top.png) | Top of page, initial load |
| Obligations | `/obligations` | 1920x900 | stress (realistic/populated) | light | [`desktop/desktop-1920-obligations-top.png`](screenshots/desktop/desktop-1920-obligations-top.png) | Top of page, initial load |
| Goals | `/goals` | 1920x900 | stress (realistic/populated) | light | [`desktop/desktop-1920-goals-top.png`](screenshots/desktop/desktop-1920-goals-top.png) | Top of page, initial load |
| Settings | `/settings` | 1920x900 | stress (realistic/populated) | light | [`desktop/desktop-1920-settings-top.png`](screenshots/desktop/desktop-1920-settings-top.png) | Top of page, initial load |
| Home / Dashboard | `/dashboard` | 834x900 | stress (realistic/populated) | light | [`tablet/tablet-834-home-top.png`](screenshots/tablet/tablet-834-home-top.png) | Top of page, initial load |
| Home / Dashboard | `/dashboard` | 834x900 | stress (realistic/populated) | light | [`tablet/tablet-834-home-bottom.png`](screenshots/tablet/tablet-834-home-bottom.png) | Scrolled to bottom of page |
| Transactions | `/transactions` | 834x900 | stress (realistic/populated) | light | [`tablet/tablet-834-transactions-top.png`](screenshots/tablet/tablet-834-transactions-top.png) | Top of page, initial load |
| Transactions | `/transactions` | 834x900 | stress (realistic/populated) | light | [`tablet/tablet-834-transactions-bottom.png`](screenshots/tablet/tablet-834-transactions-bottom.png) | Scrolled to bottom of page |
| Budget | `/budgets` | 834x900 | stress (realistic/populated) | light | [`tablet/tablet-834-budget-top.png`](screenshots/tablet/tablet-834-budget-top.png) | Top of page, initial load |
| Budget | `/budgets` | 834x900 | stress (realistic/populated) | light | [`tablet/tablet-834-budget-bottom.png`](screenshots/tablet/tablet-834-budget-bottom.png) | Scrolled to bottom of page |
| Cash Flow | `/cash-flow` | 834x900 | stress (realistic/populated) | light | [`tablet/tablet-834-cashflow-top.png`](screenshots/tablet/tablet-834-cashflow-top.png) | Top of page, initial load |
| Cash Flow | `/cash-flow` | 834x900 | stress (realistic/populated) | light | [`tablet/tablet-834-cashflow-bottom.png`](screenshots/tablet/tablet-834-cashflow-bottom.png) | Scrolled to bottom of page |
| Accounts | `/accounts` | 834x900 | stress (realistic/populated) | light | [`tablet/tablet-834-accounts-top.png`](screenshots/tablet/tablet-834-accounts-top.png) | Top of page, initial load |
| Accounts | `/accounts` | 834x900 | stress (realistic/populated) | light | [`tablet/tablet-834-accounts-bottom.png`](screenshots/tablet/tablet-834-accounts-bottom.png) | Scrolled to bottom of page |
| Credit & Payments (Installments) | `/installments` | 834x900 | stress (realistic/populated) | light | [`tablet/tablet-834-installments-top.png`](screenshots/tablet/tablet-834-installments-top.png) | Top of page, initial load |
| Credit & Payments (Installments) | `/installments` | 834x900 | stress (realistic/populated) | light | [`tablet/tablet-834-installments-bottom.png`](screenshots/tablet/tablet-834-installments-bottom.png) | Scrolled to bottom of page |
| Recurring | `/recurring` | 834x900 | stress (realistic/populated) | light | [`tablet/tablet-834-recurring-top.png`](screenshots/tablet/tablet-834-recurring-top.png) | Top of page, initial load |
| Recurring | `/recurring` | 834x900 | stress (realistic/populated) | light | [`tablet/tablet-834-recurring-bottom.png`](screenshots/tablet/tablet-834-recurring-bottom.png) | Scrolled to bottom of page |
| Obligations | `/obligations` | 834x900 | stress (realistic/populated) | light | [`tablet/tablet-834-obligations-top.png`](screenshots/tablet/tablet-834-obligations-top.png) | Top of page, initial load |
| Obligations | `/obligations` | 834x900 | stress (realistic/populated) | light | [`tablet/tablet-834-obligations-bottom.png`](screenshots/tablet/tablet-834-obligations-bottom.png) | Scrolled to bottom of page |
| Goals | `/goals` | 834x900 | stress (realistic/populated) | light | [`tablet/tablet-834-goals-top.png`](screenshots/tablet/tablet-834-goals-top.png) | Top of page, initial load |
| Goals | `/goals` | 834x900 | stress (realistic/populated) | light | [`tablet/tablet-834-goals-bottom.png`](screenshots/tablet/tablet-834-goals-bottom.png) | Scrolled to bottom of page |
| Home / Dashboard | `/dashboard` | 390x844 | stress (realistic/populated) | light | [`mobile/mobile-390-home-top.png`](screenshots/mobile/mobile-390-home-top.png) | Top of page, initial load |
| Home / Dashboard | `/dashboard` | 390x844 | stress (realistic/populated) | light | [`mobile/mobile-390-home-bottom.png`](screenshots/mobile/mobile-390-home-bottom.png) | Scrolled to bottom of page |
| Transactions | `/transactions` | 390x844 | stress (realistic/populated) | light | [`mobile/mobile-390-transactions-top.png`](screenshots/mobile/mobile-390-transactions-top.png) | Top of page, initial load |
| Transactions | `/transactions` | 390x844 | stress (realistic/populated) | light | [`mobile/mobile-390-transactions-bottom.png`](screenshots/mobile/mobile-390-transactions-bottom.png) | Scrolled to bottom of page |
| Budget | `/budgets` | 390x844 | stress (realistic/populated) | light | [`mobile/mobile-390-budget-top.png`](screenshots/mobile/mobile-390-budget-top.png) | Top of page, initial load |
| Budget | `/budgets` | 390x844 | stress (realistic/populated) | light | [`mobile/mobile-390-budget-bottom.png`](screenshots/mobile/mobile-390-budget-bottom.png) | Scrolled to bottom of page |
| Cash Flow | `/cash-flow` | 390x844 | stress (realistic/populated) | light | [`mobile/mobile-390-cash-flow-top.png`](screenshots/mobile/mobile-390-cash-flow-top.png) | Top of page, initial load |
| Cash Flow | `/cash-flow` | 390x844 | stress (realistic/populated) | light | [`mobile/mobile-390-cash-flow-bottom.png`](screenshots/mobile/mobile-390-cash-flow-bottom.png) | Scrolled to bottom of page |
| Accounts | `/accounts` | 390x844 | stress (realistic/populated) | light | [`mobile/mobile-390-accounts-top.png`](screenshots/mobile/mobile-390-accounts-top.png) | Top of page, initial load |
| Accounts | `/accounts` | 390x844 | stress (realistic/populated) | light | [`mobile/mobile-390-accounts-bottom.png`](screenshots/mobile/mobile-390-accounts-bottom.png) | Scrolled to bottom of page |
| Credit & Payments (Installments) | `/installments` | 390x844 | stress (realistic/populated) | light | [`mobile/mobile-390-installments-top.png`](screenshots/mobile/mobile-390-installments-top.png) | Top of page, initial load |
| Credit & Payments (Installments) | `/installments` | 390x844 | stress (realistic/populated) | light | [`mobile/mobile-390-installments-bottom.png`](screenshots/mobile/mobile-390-installments-bottom.png) | Scrolled to bottom of page |
| Recurring | `/recurring` | 390x844 | stress (realistic/populated) | light | [`mobile/mobile-390-recurring-top.png`](screenshots/mobile/mobile-390-recurring-top.png) | Top of page, initial load |
| Recurring | `/recurring` | 390x844 | stress (realistic/populated) | light | [`mobile/mobile-390-recurring-bottom.png`](screenshots/mobile/mobile-390-recurring-bottom.png) | Scrolled to bottom of page |
| Obligations | `/obligations` | 390x844 | stress (realistic/populated) | light | [`mobile/mobile-390-obligations-top.png`](screenshots/mobile/mobile-390-obligations-top.png) | Top of page, initial load |
| Obligations | `/obligations` | 390x844 | stress (realistic/populated) | light | [`mobile/mobile-390-obligations-bottom.png`](screenshots/mobile/mobile-390-obligations-bottom.png) | Scrolled to bottom of page |
| Goals | `/goals` | 390x844 | stress (realistic/populated) | light | [`mobile/mobile-390-goals-top.png`](screenshots/mobile/mobile-390-goals-top.png) | Top of page, initial load |
| Goals | `/goals` | 390x844 | stress (realistic/populated) | light | [`mobile/mobile-390-goals-bottom.png`](screenshots/mobile/mobile-390-goals-bottom.png) | Scrolled to bottom of page |
| Settings | `/settings` | 390x844 | stress (realistic/populated) | light | [`mobile/mobile-390-settings-top.png`](screenshots/mobile/mobile-390-settings-top.png) | Top of page, initial load |
| Settings | `/settings` | 390x844 | stress (realistic/populated) | light | [`mobile/mobile-390-settings-bottom.png`](screenshots/mobile/mobile-390-settings-bottom.png) | Scrolled to bottom of page |
| Transactions — Add form | `/transactions/new` | 390x844 | stress (realistic/populated) | light | [`mobile/mobile-390-add-transaction.png`](screenshots/mobile/mobile-390-add-transaction.png) | Inline/full-page add form open |
| Accounts | `/accounts` | 390x844 | stress (realistic/populated) | light | [`mobile/mobile-390-add-account.png`](screenshots/mobile/mobile-390-add-account.png) | Inline/full-page add form open |
| Obligations | `/obligations` | 390x844 | stress (realistic/populated) | light | [`mobile/mobile-390-add-obligation.png`](screenshots/mobile/mobile-390-add-obligation.png) | Inline/full-page add form open |
| Sign In | `/sign-in` | 1440x900 | signedout | light | [`desktop/auth-desktop-1440-sign-in.png`](screenshots/desktop/auth-desktop-1440-sign-in.png) | Top of page |
| Sign Up | `/sign-up` | 1440x900 | signedout | light | [`desktop/auth-desktop-1440-sign-up.png`](screenshots/desktop/auth-desktop-1440-sign-up.png) | Top of page |
| Forgot Password | `/forgot-password` | 1440x900 | signedout | light | [`desktop/auth-desktop-1440-forgot-password.png`](screenshots/desktop/auth-desktop-1440-forgot-password.png) | Top of page |
| Create Household | `/onboarding/create-household` | 1440x900 | onboarding | light | [`desktop/auth-desktop-1440-create-household.png`](screenshots/desktop/auth-desktop-1440-create-household.png) | Top of page |
| Invite Partner | `/onboarding/invite-partner` | 1440x900 | onboarding | light | [`desktop/auth-desktop-1440-invite-partner.png`](screenshots/desktop/auth-desktop-1440-invite-partner.png) | Top of page |
| Sign In | `/sign-in` | 390x844 | signedout | light | [`mobile/auth-mobile-390-sign-in.png`](screenshots/mobile/auth-mobile-390-sign-in.png) | Top of page |
| Sign Up | `/sign-up` | 390x844 | signedout | light | [`mobile/auth-mobile-390-sign-up.png`](screenshots/mobile/auth-mobile-390-sign-up.png) | Top of page |
| Forgot Password | `/forgot-password` | 390x844 | signedout | light | [`mobile/auth-mobile-390-forgot-password.png`](screenshots/mobile/auth-mobile-390-forgot-password.png) | Top of page |
| Create Household | `/onboarding/create-household` | 390x844 | onboarding | light | [`mobile/auth-mobile-390-create-household.png`](screenshots/mobile/auth-mobile-390-create-household.png) | Top of page |
| Invite Partner | `/onboarding/invite-partner` | 390x844 | onboarding | light | [`mobile/auth-mobile-390-invite-partner.png`](screenshots/mobile/auth-mobile-390-invite-partner.png) | Top of page |
| Home / Dashboard | `/dashboard` | 1440x900 | stress (realistic/populated) | dark | [`dark/dark-desktop-1440-home.png`](screenshots/dark/dark-desktop-1440-home.png) | Top of page |
| Transactions | `/transactions` | 1440x900 | stress (realistic/populated) | dark | [`dark/dark-desktop-1440-transactions.png`](screenshots/dark/dark-desktop-1440-transactions.png) | Top of page |
| Budget | `/budgets` | 1440x900 | stress (realistic/populated) | dark | [`dark/dark-desktop-1440-budget.png`](screenshots/dark/dark-desktop-1440-budget.png) | Top of page |
| Cash Flow | `/cash-flow` | 1440x900 | stress (realistic/populated) | dark | [`dark/dark-desktop-1440-cashflow.png`](screenshots/dark/dark-desktop-1440-cashflow.png) | Top of page |
| Accounts | `/accounts` | 1440x900 | stress (realistic/populated) | dark | [`dark/dark-desktop-1440-accounts.png`](screenshots/dark/dark-desktop-1440-accounts.png) | Top of page |
| Accounts | `/accounts` | 1440x900 | stress (realistic/populated) | dark | [`dark/dark-desktop-1440-add-form.png`](screenshots/dark/dark-desktop-1440-add-form.png) | Inline/full-page add form open |
| Sign In | `/sign-in` | 1440x900 | signedout | dark | [`dark/dark-desktop-1440-sign-in.png`](screenshots/dark/dark-desktop-1440-sign-in.png) | Top of page |
