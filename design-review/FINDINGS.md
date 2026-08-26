# Checkpoint 1 — Visual Findings Matrix

Independent review of the 97 screenshots in `design-review/screenshots/` (commit `f56820f`),
route by route, breakpoint by breakpoint. No code changed in this pass — findings only.

Verdict definitions:
- **KEEP** — no observable design/UX problem. Leave alone.
- **POLISH** — the composition/structure is right; typography, spacing, chart quality, or a
  specific surface treatment needs refinement.
- **RECOMPOSE** — the layout itself is wrong for the viewport (usually: a mobile/tablet
  single-column composition simply centered or widened on desktop/tablet, with no real use
  of the available width).

## Cross-cutting patterns (not route-specific)

1. **The "centered mobile column" pattern.** Home, Cash Flow, Accounts, Installments, Recurring,
   Obligations, and Goals all cap their content at roughly the same ~1150px column and center it
   in whatever's left. At 1440 this reads as merely spacious; at 1920 it reads as a narrow app in
   a big browser window, most visibly on Cash Flow, Obligations, and Goals, where the content
   column ends around x≈1350–1380 and the remaining ~300–500px to the sidebar is flat beige with
   nothing in it. Transactions, Budget, and Settings already break this pattern (Budget's sidebar,
   Transactions' sidebar, Settings' two-column split) — they're the evidence a secondary column is
   the right fix, not a wider max-width.
2. **Tablet is desktop's narrow-column problem's mirror image: mobile's column, widened.**
   Transactions, Accounts, Cash Flow, Budget, and Installments at 834px are — as far as the
   screenshots show — pixel-for-pixel the same single-column mobile composition (same compact
   icon-only header, same stacked cards, same bottom tab bar) with more horizontal padding. No
   screen introduces a genuine two-column tablet tier. Installments is the clearest case: the two
   billing-cycle cards sit side-by-side on desktop but stack vertically at 834px despite there
   being obviously enough width for both.
3. **"Card inside background inside card."** Every screen leans on the same recipe — beige page
   canvas, then a white/near-white `rounded-card`-bordered box, sometimes with a second bordered
   box nested inside it (Installments' two cycle cards + a third bordered list card; Accounts'
   hero + 3 group cards). Nothing is currently broken (no literal double-border bug — that class
   of bug was fixed last pass), but there's no deliberate surface-level vocabulary: every logical
   grouping becomes a bordered rectangle by default, which is what makes screens with few bordered
   groups (Obligations, Goals) look sparse and screens with many (Installments, Accounts) look
   like stacked boxes rather than one composed screen.
4. **Black hero/total cards are a real, working piece of visual identity** (Home's "פנוי באמת",
   Recurring's and Obligations' totals). All three read as intentional and confident. Preserve the
   treatment; the problems near them are about what sits *beside* them (Home) or *above* them
   (Recurring's price-increase card currently outranks the total in the reading order).
5. **Dark mode surface distinction is thin.** Spot-checked Accounts' add-form dark screenshot: the
   page canvas and the account-row card are close enough in value that the boundary between them
   reads mostly as a hairline divider, not a surface change. Likely reappears anywhere the current
   light-mode "off-white canvas / white card" pair maps to two very similar dark grays. Flagging
   for Checkpoint 8, not fixing now — it's a symptom of finding #3 (no explicit surface levels)
   more than a dark-mode-specific bug.

## Per-route matrix

| Screen | Desktop 1440–1920 | Tablet 834 | Mobile 390 | Dark |
|---|---|---|---|---|
| **Home** | **RECOMPOSE** — row 1's black hero and "מה מגיע" are unbalanced (hero has a large empty region right of the figure/breakdown; "מה מגיע" fills its column edge-to-edge). Row 2's three cards are already reasonably balanced. Composition reads as three independently-sized widgets, not one designed hierarchy. | Not captured (not in the requested tablet screen list — Home wasn't named in the user's tablet audit list). | **KEEP** — strong hierarchy, hero identity intact, compact upcoming/budget/analysis sections. This is the benchmark the user asked for; desktop should move toward this level of intentionality, not the reverse. | Spot-checked via light-mode desktop only so far; revisit in Checkpoint 8. |
| **Transactions** | **RECOMPOSE** (width) + **POLISH** (toolbar density). At 1920 the content column stops at ~x=1360, leaving ~330px dead beige before the sidebar. Separately, the vertical stack above the table — 3 selects, search, 2 segmented-control rows, the "12 pending classification" banner, then the sidebar's net card and rules card — is a lot of chrome before the first table row. Matches the user's own diagnosis exactly. | **RECOMPOSE** — at 834 this is the mobile list (icon-only header, day-grouped cards, FAB) with more padding, not a tablet composition. No filter bar, no visible search, no sidebar. | **KEEP** — the mobile list (icon toolbar, search, day grouping, FAB) works and shouldn't change except where a shared-component change flows through. | Not yet spot-checked; revisit Checkpoint 8. |
| **Budget** | **POLISH** — already the strongest desktop screen: sidebar (donut + trend + uncategorized) genuinely fills the width, category rows have real hierarchy. The donut and monthly-bar chart are visually plainer than the surrounding UI (thin default typography, no interaction/tooltip, chart legend is a bare list). Do not restructure the composition. | **RECOMPOSE** — at 834 the sidebar (donut/trend/uncategorized) does not appear at all in the top-of-page view; this is the mobile single-column composition, not a tablet-adapted one. Needs its own tier, not necessarily desktop's exact 2-column split. | Not fully reviewed this pass; assume KEEP pending a direct look in Checkpoint 5. | Not yet spot-checked. |
| **Cash Flow** | **RECOMPOSE** — the single clearest "mobile chart centered in a big browser window" case. At 1920 the whole card (chart + event list) sits in a ~1060px column with roughly equal, large, empty margins on both sides. The chart itself doesn't grow to use the extra width (same date-tick density as 1440). No secondary column at all despite obviously-available real content (event detail, forecast breakdown). | **RECOMPOSE** — same single narrow card, further compressed; the line chart is visibly small relative to the 834px canvas. | **KEEP** structurally; not fully re-reviewed this pass but no new problem surfaced. | Not yet spot-checked. |
| **Accounts** | **RECOMPOSE** (width) + **POLISH** (hero visualization). Same dead-zone-at-1920 pattern. The hero card's own "what's owed / what's illiquid" breakdown (added last pass) helps but the card still reads as three text blocks, not a visual asset/liability picture — the user's ask for "understood visually rather than through numbers alone" is not yet met. Account rows themselves are fine (simple, scannable — keep as-is). | **RECOMPOSE** — single-column mobile card list widened; the 3 account groups (liquid/owed/illiquid) are exactly the kind of content that could sit two-up at 834px instead of stacking full-width. | **KEEP** — rows and hero work at 390; no new problem found. | Spot-checked (add-form dark, see cross-cutting #5) — canvas/card contrast is thin. |
| **Installments (Credit & Payments)** | **RECOMPOSE** (populated state only) + **KEEP** (empty state). Empty state is explicitly good per the user's brief — preserve verbatim. Populated state: dead-zone-at-1920 again, and the two cycle cards + the installments-list card read as three independent white boxes rather than one coherent "your credit picture" — matches the user's own note precisely. | **RECOMPOSE** — the two cycle cards stack vertically at 834px despite clearly having room to sit side-by-side (each is ~380px wide on desktop; 834px minus gutter comfortably fits two). | **KEEP** — not reviewed for new issues this pass. | Not yet spot-checked. |
| **Recurring** | **RECOMPOSE** (width) + **POLISH** (hierarchy). Dead-zone-at-1920. Also: the price-increase warning card currently sits *above* the black total card in reading order, so a household opens the screen and sees "prices went up" before "here's your monthly total" — the user asked for warnings to be "noticeable without dominating," and leading with them arguably over-dominates. | Not yet captured/reviewed in this pass — infer RECOMPOSE by pattern, confirm directly in Checkpoint 6. | **KEEP** — not reviewed for new issues this pass. | Not yet spot-checked. |
| **Obligations** | **RECOMPOSE** — the sparsest desktop screen after Goals: total card + 4 rows + button, then roughly two-thirds of the 1920 viewport is empty. Row content itself (date badge, urgency pill, shared/personal tag, amount) is reasonably rich already — the problem is purely "single short column in a big canvas," not the row design. | Not yet captured/reviewed in this pass — infer RECOMPOSE by pattern, confirm directly in Checkpoint 6. | **KEEP**. | Not yet spot-checked. |
| **Goals** | **RECOMPOSE** — sparsest screen in the app. No hero card at all (unlike every sibling planning screen), plain divided rows with no per-goal card/icon treatment, large empty canvas both wide and tall at 1920. The progress bars and pace sentences are real, useful, already-computed data (target/current/%/remaining/date/pace) — the fix is presentation of what exists, explicitly **not** inventing new widgets. | Not yet captured/reviewed in this pass — infer RECOMPOSE by pattern, confirm directly in Checkpoint 6. | **KEEP**. | Not yet spot-checked. |
| **Settings** | **POLISH** — already a genuine 2-column desktop composition (unlike the RECOMPOSE group above). Right column (profile+household) ends well above the left column's bottom, leaving a real but smaller dead region than the single-column screens. Lower priority; not in the user's explicit P0 list. Address for consistency in Checkpoint 7, not as a structural rebuild. | Not requested by the user's tablet list. | Not reviewed this pass. | Not yet spot-checked. |
| **Auth / Onboarding** (Sign in/up, Forgot password, Create household, Invite partner) | **KEEP** — last pass's desktop card treatment already gives these a deliberate, calm, centered composition appropriate to auth. No new problem surfaced. | N/A (not requested). | **KEEP**. | Sign-in dark spot-checked last pass — clean. |

## Priority ranking for the implementation checkpoints ahead

Ordered by (a) how badly the desktop/tablet composition problem reads, (b) how much of the app
it touches structurally, and (c) the user's own stated checkpoint order:

1. **Shared primitives first** (Checkpoint 3) — the "dead-zone-at-1920" pattern and the "card
   inside background inside card" pattern both show up on 6+ screens with the same root cause
   (no desktop grid system, no explicit surface levels). Fixing each screen independently before
   fixing the shared cause would mean redoing the same layout decision 6 times.
2. **Home + Transactions** (Checkpoint 4) — Home because the user named it the explicit visual
   benchmark; Transactions because it's the highest-traffic screen and already has the most
   evidence of what a working secondary column looks like (its own sidebar).
3. **Cash Flow + Budget + Accounts** (Checkpoint 5) — Cash Flow is the single worst dead-zone
   offender; Budget needs polish, not restructuring, so it's a lighter lift; Accounts needs both
   the grid fix and the hero-visualization polish.
4. **Goals + Obligations + Recurring + Installments** (Checkpoint 6) — all four share the same
   grid problem; Goals and Obligations additionally need real row/card redesign using only
   existing data (no invented widgets); Installments' populated state needs the "one coherent
   product, not three boxes" treatment while its empty state is explicitly preserved.
5. **Forms + Auth + Settings** (Checkpoint 7) — auth is already KEEP; Settings is POLISH-only;
   forms audit is genuinely new work (grouping/hierarchy/progressive disclosure) not yet assessed
   screenshot-by-screenshot in this pass — do that assessment at the start of Checkpoint 7, since
   the current screenshot set captures forms open but wasn't reviewed for internal form hierarchy
   in this checkpoint.
