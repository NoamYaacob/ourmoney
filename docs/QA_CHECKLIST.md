# OurMoney — Product QA Checklist

This checklist is the release-oriented functional and responsive QA pass for the current MVP/Post-MVP surface. It complements unit, type, lint, export, RLS, concurrency, secret-scan, and dependency-audit CI; it does not replace those gates.

## Viewports

Run every high-priority flow at least once in:

- Mobile web: iPhone-sized Safari viewport / physical iPhone Safari.
- Narrow web: 390–430 px wide.
- Tablet web: ~768–1024 px.
- Desktop web: >=1200 px, where the right-side navigation rail replaces the bottom tabs.
- Native device build later, once signing is available, for biometrics, notifications, file picker, and other native-only behaviour.

At every viewport verify RTL ordering, no horizontal overflow, no clipped controls, readable amounts, visible focus/press states, and that the final interactive control can scroll fully above persistent navigation/FABs.

## Core navigation and shell

- Dashboard, Transactions, Budgets, Settings are reachable from mobile bottom tabs.
- Desktop rail appears at >=1200 px and bottom tabs disappear.
- Desktop rail reaches Dashboard, Transactions, Budgets, Cash Flow, Alerts, Recurring, Goals, Obligations, Accounts, Settings.
- Active navigation state is visually unambiguous.
- Deep/detail screens do not leak into the tab bar.
- Browser back/forward does not strand the user on an invalid route.

## Dashboard

- Safe-to-Spend card shows the derived amount and its breakdown.
- Current-month budget summary shows allocation, spend, remaining, and over-budget state correctly.
- Month navigation updates budget-backed content without changing the real-time Safe-to-Spend horizon.
- Alerts section links to the full Alerts screen.
- Category progress, recent transactions, and analytics render populated and empty states correctly.
- FAB opens New Transaction and never covers the final scrollable content.

## Transactions

- List renders income, expense, personal/shared, uncategorized, excluded, and internal-transfer samples correctly.
- Search filters descriptions/merchant/category text.
- Type, scope, account, category, and period filters combine correctly.
- Category bottom sheet opens, scrolls, selects, and dismisses correctly on mobile web.
- New Transaction validates amount/account/description and saves a shared or personal transaction.
- Edit Transaction loads current values, saves changes, and handles optimistic-concurrency conflict UI.
- Delete Transaction requires confirmation and removes only the selected record.
- Bulk categorization works on selected uncategorized transactions.
- CSV import picker/parser/preview/error handling works; native picker gets a separate real-device pass.

## Internal transfers

- Creating a transfer requires two different household accounts and a positive amount.
- Transfer appears as one logical movement in the transaction list, not as income + expense in analytics.
- Transfer detail/edit updates both generated transaction legs.
- Deleting a transfer removes both legs.
- Household balances/analytics remain internally consistent after create/edit/delete.

## Budgets

- Current month shows total budget, spent, remaining, and category allocations.
- Category allocation can be created/updated without duplicate category allocation.
- Spending progress excludes excluded transactions and internal transfers.
- Previous/next month navigation works.
- Copy-previous-month budget behaves correctly when source/destination exists or is empty.
- Over-budget categories use the danger treatment and correct integer-safe percentages.

## Cash Flow / Safe-to-Spend

- Week / month / 30-day horizons update the breakdown.
- Available cash, planned obligations, recurring charges, and Safe-to-Spend reconcile.
- Forecast chart handles populated data and a zero-data period.
- Upcoming events render in chronological order.
- Negative Safe-to-Spend produces a clear shortfall state.

## Alerts

- Empty state is calm and does not look like an error.
- Populated alerts are ordered by severity/date and route to the relevant feature.
- Recurring price-increase and financial-risk alerts display correct severity styling.

## Recurring transactions

- List shows active recurrence, amount, next date, category, and account.
- Create supports valid frequencies/day-of-month combinations.
- Edit and deactivate/reactivate work with concurrency protection.
- Generated transaction is idempotent for a due period.
- Price-change history/alert path is checked where applicable.

## Planned obligations

- Upcoming obligation appears in list and Safe-to-Spend.
- Create/edit validates positive amount and due date.
- Status transitions upcoming -> completed/cancelled are reflected consistently.
- Concurrency conflict UI appears on stale update.
- Delete removes only the selected obligation.

## Savings goals

- Goal progress uses current/target amounts correctly.
- Create/edit validates target amount and optional target date/account.
- Completion state is visually distinct.
- Delete confirmation works.

## Accounts

- Account list shows type, balance, inclusion state, and ownership correctly.
- Create/edit supports supported account types.
- Include-in-total changes roll up consistently into cash calculations.
- Inactive account behaviour is clear and does not break historical transactions.

## Categories and rules

- System categories are available and RTL labels/icons are correct.
- Custom category create/edit/deactivate works.
- Category rules can be created/edited/deleted.
- Rule provenance is visible through transaction categorization behaviour.
- Manual recategorization is not unexpectedly overwritten by a rule.

## Household / profile

- Display-name edit persists.
- Household rename is admin-only.
- Invite flow creates a usable invite and handles share failure.
- Second member can accept invite and sees shared data through Realtime.
- Admin can remove a non-admin member.
- Leave-household behaviour covers ordinary member, multi-member admin succession, and sole-member household deletion warning.

## Appearance / accessibility / security

- System/light/dark mode changes immediately and persists.
- Dynamic text remains usable at supported scaling.
- Buttons, rows, sheets, and tabs have usable touch targets.
- Keyboard focus order is logical on desktop web.
- Biometric preference reports unavailable on web without pretending browser biometrics are enabled.
- Native biometric lock/re-lock is tested later on a signed device build.
- Destructive actions are confirmation-gated and double-activation protected.

## Responsive acceptance criteria

- Mobile: no persistent-nav overlap, no FAB overlap on final content, no horizontal scrolling, form controls stay inside viewport, sheets fit the visual viewport.
- Tablet: content does not look like an over-stretched phone screen; shared width clamps remain centered.
- Desktop: right rail is fixed to the RTL side, content uses bounded wide/form columns, multi-panel layouts feel balanced rather than sparse, dialogs remain bounded.
- Safari: focusing text inputs must not unexpectedly zoom the page.

## Preview QA dataset

The shared Preview database may contain temporary rows prefixed with `[QA]` for this pass. They are intentionally distinguishable from user-created data and must be removed after the feature pass is complete. Never seed or clean QA data in a production project.
