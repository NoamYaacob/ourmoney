# Checkpoint 2 — Desktop/Tablet Layout & Surface System

Architecture and target compositions only. No code changed in this pass. Answers the 12 sections
of the Checkpoint 2 brief in order. Grounded in the actual current tokens (`constants/layout.ts`,
`tailwind.config.js`, `components/ui/Money.tsx`) rather than inventing a parallel system —
extends what exists, replaces only what's demonstrably wrong.

---

## 1. Desktop layout rules

**Two column shapes exist on desktop, not one universal grid.** Checkpoint 1 found that only
two screens (Transactions, Budget) have a second, genuinely useful category of existing data —
everywhere else, the honest fix is a single column with a deliberate max-width and richer
internal composition. Section 5 makes this decision per screen; this section defines the two
shapes both draw from.

**Shape A — Primary + rail** (Transactions, Budget):
- Primary column: flexible, `min-width: 760px`, grows with the viewport up to `max-width: ~1040px`.
- Rail: fixed `320px` (`280px` at tablet's own rail tier — section 2).
- Gutter between them: `32px`.
- Total content width: ~1150px at the low end of desktop (1200–1280px viewport) up to ~1390px
  at 1920px viewport — the rail does not grow; only the primary column does, because a data
  table/list benefits from extra width and a summary rail does not.

**Shape B — Single column, no rail** (Home is its own bespoke case, see §7; Cash Flow, Accounts,
Goals, Obligations, Recurring, Installments use this shape):
- Content max-width: **900–960px** for screens with genuinely more content per section (Accounts,
  Installments — multiple groups/rows), **760–820px** for screens with simpler rows (Goals,
  Obligations, Recurring, matching Budget's own category-list column width, which already reads
  well at that width today).
- This does **not** eliminate all whitespace at 1920px, and is not meant to. See §6 — a
  single-column screen with no second real data category keeps its residual margin as a
  **deliberate, symmetric, generously-sized frame**, not a bug to keep chasing. What changes
  between "before" (flagged RECOMPOSE) and "after" is: (a) the margin reads as an intentional
  design choice — consistent gutters, content anchored rather than looking like it just wasn't
  given a width rule — and (b) the content itself gets visually richer (§5 per screen) so the
  page doesn't read as *empty*, only as *spacious*.

**When a screen stays single-column:** when there's no existing, different-in-kind piece of
data to justify a second column (§6 has the explicit per-screen justification/rejection table).
**When a secondary rail is justified:** only when real, already-computed data currently exists
but is either absent from the page or requires navigating away to see — Transactions' net figure
and active classification rules, Budget's category breakdown/trend, both already built and
already correctly placed.

**Behavior at 1280 / 1440 / 1920 — and an open engineering question:**
The brief asks for distinct behavior at three desktop widths. Being direct about what's safe to
commit to now: `tailwind.config.js` currently defines exactly two web breakpoints, `tablet: 768px`
and `desktop: 1200px` — there is no third desktop-only breakpoint today, and this codebase has
already been burned once this project by assuming a CSS technique (negative-margin edge-bleed)
works identically under NativeWind/react-native-web when it didn't (Cash Flow banner-merge,
prior session). A **fluid** width (CSS `clamp()`/`min()` growing smoothly from 1280→1920) would
be the ideal way to satisfy "grows moderately across the range," but I have not yet verified
NativeWind's arbitrary-value support renders `max-w-[clamp(...)]` correctly in this stack.

Decision: **ship a single fixed desktop cap per shape (the numbers above) for Checkpoint 3**,
verified at 1280/1440/1920 by screenshot same as everything else in this project, and treat a
fluid clamp-based version as a **later refinement** only if the fixed cap looks visibly static
between 1440 and 1920 in the actual screenshots (i.e., prove the problem exists before adding the
CSS-function risk). This is a smaller, honestly-scoped version of what was asked, not a
downgrade of the target — the fixed caps above are already meaningfully wider at 1920 than
today's `wide` (1150px) tier for Shape A, and meaningfully different from today's effectively
unbounded single-column screens for Shape B.

---

## 2. Tablet layout rules

Tablet must not become "mobile widened" (Checkpoint 1's finding on Transactions, Accounts,
Cash Flow, Budget, Installments) and must not become "desktop with a smaller rail" either — no
`web:desktop:` sidebar/rail styling ever applies below `1200px`.

**One new named breakpoint is needed**: the current `tablet: 768px` covers the *entire*
768–1199px range as one CSS tier, but the real behavioral split observed in Checkpoint 1 is at
**1024px** — below it, a genuine two-column composition doesn't have enough width to stay
comfortable at touch scale; above it, it does. Propose adding `tabletLg: '1024px'` to
`tailwind.config.js`'s `screens` (alongside the existing `tablet`/`desktop`, additive, changes
nothing for any current `web:tablet:`/`web:desktop:` usage).

- **768–833px**: mobile's own composition, unchanged, just wider gutters (already how `narrow`/
  `medium` CONTENT_WIDTH tiers behave — no change needed here).
- **834–1023px** (`web:tablet:`, below `tabletLg`): the "2-up card grid" tier — used **only**
  where a screen already has 2 (or 3, wrapping) roughly-equal, comparably-sized existing blocks
  that currently stack full-width for no reason but the viewport used to be narrower. This is
  content wrapping into a grid, not a new asymmetric primary/rail composition:
  - **Accounts**: the 3 account groups (liquid/owed/illiquid) wrap 2-up instead of stacking full
    width.
  - **Installments**: the 2 billing-cycle cards sit side by side (they're already ~380px each on
    desktop — 834px comfortably fits both plus a gutter).
  - Everything else stays single-column through this range (Goals, Obligations, Recurring have
    no natural pairs to wrap; Transactions and Budget need the *rail* shape, which needs more
    width than 834–1023px comfortably gives at touch scale, so they stay single-column with an
    improved toolbar/compact-summary instead — see below).
- **1024–1199px** (`web:tabletLg:`): the "scaled-down rail" tier — for the two screens that get a
  real rail on desktop (Transactions, Budget), the same primary+rail shape applies here at
  reduced proportions (rail `280px`, gutter `24px`), still with `≥44px` touch targets and no
  hover-dependent affordances. Screens without a desktop rail (Cash Flow, Accounts, Goals,
  Obligations, Recurring, Installments) do **not** gain a rail here either — they simply keep
  growing their single-column max-width modestly, same as they will approaching desktop.
- **All of 768–1199px**: bottom tab-bar navigation (mobile's, unchanged) — never the desktop
  side-rail. This was already correct in the current build; stating it explicitly so it isn't
  accidentally lost while touching layout code.

**Per-screen tablet target** (mirrors the desktop decision at the appropriate scale — full
detail in §5):

| Screen | 768–833 | 834–1023 | 1024–1199 |
|---|---|---|---|
| Transactions | mobile list, real filter bar (not icon-only) | same, wider padding | primary+rail (scaled) |
| Accounts | mobile list | **2-up group grid** | 2-up group grid, wider |
| Budget | mobile list, compact analytics strip (not dropped) | same | primary+rail (scaled) |
| Cash Flow | chart scales to fill width | chart scales to fill width | chart scales to fill width |
| Goals | mobile list, richer rows | same | same |
| Obligations | mobile list, urgency-grouped | same | same |
| Recurring | mobile list, total-card-first | same | same |
| Installments | mobile list | **2-up cycle cards** | 2-up cycle cards, wider |

---

## 3. Surface hierarchy

Five levels, mapped to tokens that already exist — no new color/radius tokens needed, only a
**rule for which level uses which token**, since Checkpoint 1's "card inside card inside card"
finding is a *usage discipline* problem, not a missing-token problem.

| Level | Role | Border | Background | Shadow | Existing token |
|---|---|---|---|---|---|
| **0 — Canvas** | The page itself | none | `bg-surface-*` | none | already correct everywhere |
| **1 — Primary panel** | The *one* bounded container per logical section | `border-*-light/70`, `rounded-card` | `bg-surfaceMuted-*` | `shadow-sm` | `DESKTOP_PANEL_CLASS` — becomes the canonical, only, "this is a card" token |
| **2 — Inset/group** | A sub-group *inside* a Level-1 panel | **none** | same as parent, or one step lighter/tinted for semantic emphasis (e.g. the existing `warningSurface`/`dangerSurface` strips) | none | new *usage rule*, not a new token: a divider (`divider-*`) or spacing/typography break, never a second border+radius+shadow |
| **3 — Interactive row** | A clickable list row inside a Level-1/2 context | none | transparent, `web:hover:bg-surface-*` on interaction | none | already how `SettingsRow`/`CommitmentRow`/account rows work — codify as the rule, not the exception |
| **4 — Elevated overlay** | Popovers, the bottom sheet, modals — things that visually float *above* the page | full border | `bg-surfaceMuted-*` | stronger shadow | `Select`'s sheet, `Modal` — unchanged, this is the one place heavier elevation is correct |
| **Hero** (parallel track, not a stacking level) | The one headline figure per screen | none | `colors.hero.*` (dark fill, doesn't invert light/dark) | none, or `shadow-sm` matching Level 1 | `HeroPanel` — unchanged, reused, never duplicated within one screen |

**The rule that fixes "card inside card inside card":** *one Level-1 panel per logical section;
everything inside it is Level 2 or Level 3, never a second Level 1.* Concretely: Installments'
2 cycle cards currently are 2 separate Level-1 boxes plus a 3rd Level-1 box for the list below —
after this rule, it's 1 Level-1 panel (2 Level-2 groups side by side) + 1 Level-1 panel (the
list). Accounts' 3 account groups are already 3 separate Level-1 boxes today (the hero is a 4th)
— under this rule that's arguably *correct as-is*, since each group is a genuinely distinct
section (liquid / owed / illiquid), not an artificial split — the rule targets *arbitrary*
nesting, not *every* multi-card screen.

**When to use each:** border and shadow are Level-1-and-Level-4 only. Background changes signal
Level 1 (surfaceMuted vs. canvas) and, sparingly, a semantically-tinted Level 2 (warning/danger
strips — already-proven pattern, keep it). Dividers are the default way to separate Level-2
groups and Level-3 rows sharing one Level-1 panel.

---

## 4. Financial hierarchy

Reuses `components/ui/Money.tsx`'s existing `size`/`tone` props — this section is a **usage
convention**, not new component work.

| Role | `Money` size | Where |
|---|---|---|
| Primary balance / hero number | `hero` / `display` | **One per screen.** Home's פנוי באמת, Accounts' available-to-spend, Recurring's/Obligations' totals. Cash Flow currently gives 3 figures (today/low-point/end) equal `display` weight — §8 demotes 2 of the 3 to `large`, since "one hero" applies here too. |
| Secondary metric | `large` | Supporting figures beside/under the hero — Accounts' owed/illiquid breakdown, Budget's spent/remaining, Cash Flow's two demoted figures. |
| Row amount | `row` | Every list-row amount — transactions, accounts, obligations, recurring, installments. Already the consistent convention from last pass; restated as the rule. |
| Metadata | `text-meta`/`text-caption`, `inkMuted` | Dates, category/account names, secondary labels. |
| Warning requiring attention | `warning`/`danger` tokens + icon (never color alone) | Price-increase strips, shortfall banners — reuse the existing tinted-strip pattern. |

**Positive/negative/neutral rule:** row-level amounts stay neutral ink (`default` tone) *unless
the row itself is the thing being flagged* (an overdue obligation, the cause row on the Cash Flow
event list) — aggregate/summary figures use `positive`/`danger` by sign. This is already how
Transactions' sidebar net figure works; the rule generalizes it rather than deciding it fresh
per screen.

**Explicit anti-pattern, stated because the brief calls it out directly:** hierarchy is not
"make the important number bigger." `hero`/`display` are reserved for the one headline figure a
screen is *for*; every other figure, no matter how locally important it feels, uses `large` or
`row`. A screen with three `display`-size numbers (current Cash Flow) has no hierarchy, only
three loud numbers.

---

## 5. Screen-by-screen target composition

### Home — bespoke, not a template (§7 detail below)
```
Desktop 1280–1920:
Row 1 (~7/5 ratio, unequal): [ מה מגיע ~5/12 ]  [ פנוי באמת hero ~7/12 ]
  Hero's own internal layout widens into its extra allocation (breakdown rows go 2-up, or the
  progress bar/legend sit beside the figure) — not just a wider empty card.
  Heights: content-driven, shared min-height floor (already exists), not forced-equal.
Row 2 (~4/4/4, unchanged): budget pace | needs attention | recent transactions.
```

### Transactions — Shape A (primary+rail), table stays dominant
```
Desktop 1280–1440: primary table (flex, 760→~900px) | rail 320px (net figure + active rules).
Desktop 1920: primary table grows to ~1000–1040px | rail unchanged at 320px.
Toolbar: 3 selects collapse into one "Filters" disclosure (chips shown only when active);
  search stays always-visible; shared/personal + type segmented controls stay visible (most-used);
  the "12 pending classification" banner shrinks from a full card to a slim single-line strip.
  None of this changes the table's own width — the toolbar compresses vertically, not the rail.
Tablet 1024–1199: same shape, rail 280px.
Tablet 768–1023: single column; toolbar becomes a real horizontal bar (search + a "Filters"
  button opening a sheet) instead of today's icon-only mobile header.
```

### Cash Flow — one forecasting experience, not a wider chart (§8 detail below)
```
Desktop/Tablet, all widths: single column, no rail (§6 — no second data category exists).
  ONE panel: answer sentence → 3 metrics (1 primary + 2 secondary, not 3 equal) → chart that
  scales its own tick density and shows event markers at their real position → event list below,
  sharing the same events already marked on the chart.
Content max-width ~900–960px (Shape B, richer tier).
```

### Accounts — Shape B, internal fix, no rail
```
Desktop: single column, ~900–960px. No rail (§6 — the only second-data-category candidate, the
  liquid/owed/illiquid split, already lives inside the hero; a rail would duplicate it).
  Hero's own composition changes from 3 text stats to an actual restrained balance visualization
  (a proportional segmented bar by liquid/owed/illiquid, real amounts, sitting with the figure)
  so it's "understood visually," per the brief, without adding a column.
  3 account-group panels: unchanged (Level-1 each — genuinely distinct sections, see §3).
Tablet 834+: the 3 groups wrap 2-up (liquid+owed side by side, illiquid full-width below, or all
  3 wrapping) instead of stacking.
```

### Goals — progress-first, single column, richer rows
```
Desktop/Tablet, all widths: single column, ~760–820px. No rail (§6 — no second data category).
  Fix is entirely per-row: each goal's progress bar becomes the dominant visual element (thicker,
  clear target/current anchors) instead of a thin decorative strip; status pill more prominent;
  rows stay Level-2 (divider-separated) inside one Level-1 panel, not individually bordered.
  Taller rows, not wider columns — "embrace whitespace intentionally," per the brief.
```

### Obligations — urgency-first, single column, grouped by timing
```
Desktop/Tablet, all widths: single column, ~760–820px. No rail (§6 — a shared/personal breakdown
  rail was considered and rejected: with the full list already visible and short, it would be a
  redundant sum with no new information, i.e. exactly the invented-widget pattern to avoid).
  Fix: group rows by urgency tier (overdue / this week / later) using the same commitmentUrgency
  logic already computed per row — presentation of existing data, not new data. Black total card
  unchanged, stays first.
```

### Recurring — total first, warnings demoted, single column
```
Desktop/Tablet, all widths: single column, ~760–820px. No rail (§6 — no second data category).
  Reorder: black total card leads (currently the price-increase card leads, inverting "position
  first, then what needs attention"). Price-increase card shrinks to a compact strip, not a
  leading hero-scale card. Main list gets a small inline indicator on rows whose price recently
  increased, connecting the warning to its row instead of only floating above the list.
```

### Installments populated state — one coherent panel, not three boxes
```
Desktop: 2 cycle "cards" become 2 Level-2 groups inside ONE Level-1 panel (side by side, divider
  or gap only). Installments-list stays its own, separate Level-1 panel below (genuinely
  different content — a scrolling list vs. two summaries). Net: 3 Level-1 boxes → 2.
  Single column, ~900–960px. No rail (§6).
Tablet 834+: the 2 cycle groups sit side by side within that one panel at tablet's own width.
Empty state: unchanged, verbatim (§11).
```

### Budget tablet (desktop composition is KEEP, only tablet changes)
```
Tablet 1024–1199: mirrors desktop's rail shape at reduced scale (rail 280px).
Tablet 768–1023: sidebar's 3 stacked cards (donut/trend/uncategorized) collapse into one compact
  horizontal strip above the category list — small donut, trend as a sparkline row, uncategorized
  as a text link — instead of disappearing entirely (today's behavior), so no information is lost
  at this width, only compressed.
```

---

## 6. Secondary-column justification

| Screen | Gets a rail? | Why / why not |
|---|---|---|
| Transactions | **Yes** (already has one) | Net figure + active classification rules — both real, already-computed, currently exactly here. Only tightening (§5), not adding new content. |
| Budget | **Yes** (already has one) | Category breakdown donut + 6-month trend + uncategorized queue — all real, already-computed, currently exactly here. |
| Home | **No** — bespoke two-row shape instead | Not a "list + rail" screen; §7 explains why it gets its own composition. |
| Cash Flow | **No** | No existing data category beyond what's already on the page once the chart itself scales. An account-balance or category-spend rail would be invented content unrelated to the forecast. |
| Accounts | **No** | The one candidate (liquid/owed/illiquid split) already lives inside the hero; a rail would duplicate it, not add to it. |
| Goals | **No** | No second data category — every goal's own fields are already shown per row. |
| Obligations | **No**, explicitly rejected | A shared/personal totals rail was considered; with the full (short) list already visible, it would just re-sum numbers already on screen — an invented widget. |
| Recurring | **No** | No second data category beyond what the list and total already show. |
| Installments | **No** | Same reasoning as Accounts — the two categories of information (this cycle's bill, the underlying plans) are both already on the page; consolidating them into one panel (§5) is the fix, not adding a third. |

Net result: **two rails in the whole app, both already existing.** Every other RECOMPOSE screen
is a single-column internal fix. This is worth stating plainly because it's the opposite of
"add sidebars because there's space" — six of eight RECOMPOSE screens explicitly do *not* get one.

---

## 7. Home

Home is not built from the Shape A/B vocabulary above — it gets its own two-row composition
(§5), because collapsing it into "primary + rail" would either force מה מגיע into a rail (wrong —
it's not a summary of the hero, it's independently important, matching the user's own priority
order #2) or force the hero into a rail (wrong — it's the screen's entire reason to exist). The
fix keeps both as full peers in row 1, rebalanced 7/5 instead of near-parity, with the hero's
*own* internal layout using its wider allocation rather than leaving a blank region beside the
figure. Row 2's three-equal-column shape already reads fine (Checkpoint 1) and is untouched.
Financial-position-first ordering (position → immediate upcoming → budget health → supporting
activity) is already the current DOM order; no reordering needed, only the row-1 balance fix.

## 8. Cash Flow

Explicitly not "make the chart bigger." Today's chart has a fixed viewBox aspect ratio and a
fixed tick count regardless of container width — so a wider container just adds blank margin
around an unchanged-density chart, which is the dead-zone Checkpoint 1 found. The fix makes
chart, metrics, and events work as one experience:
1. **Metrics** stop being three equal `display`-size numbers (no hierarchy — see §4) and become
   one primary (the low point or end balance — whichever answers "where is my money heading")
   plus two `large`-size secondary figures.
2. **The chart becomes width-aware**: more container width means more visible date ticks (real
   information — currently hidden by a fixed tick count) and, using data already computed per
   event (`date`, `direction`, `amount`), event markers appear at their real x-position on the
   line — this is the "represent events subtly on the timeline" the brief asks about, using zero
   new data.
3. **The event list below** is the same events now also marked on the chart — scanning from a
   marker down into its row is the connective mechanic, not a new component.

No secondary rail (§6) — the fix is the one existing object on the page actually using its
container, not a second object beside it.

## 9. Goals and Obligations

Not the same template. Goals visually emphasizes *progress* (a thicker, clearer per-goal
progress bar is the dominant element of each row); Obligations visually emphasizes *timing and
urgency* (rows grouped by overdue/this-week/later using the urgency data already computed per
row, not a progress bar — an obligation doesn't have "progress," it has a due date). Both stay
single-column with no rail (§6), both keep their black total-style card, and both fix their
existing rows rather than inventing new sections.

## 10. Transactions

Covered in §5. The one explicit constraint restated here since the brief calls it out
separately: the toolbar redesign (selects → disclosure, banner → strip) only removes *vertical*
space, never touches the rail width (320px, unchanged) or the primary column's own width — the
table gets *more* usable width at 1920 (§1), never less.

---

## 11. Preservation list

Explicitly unchanged in Checkpoints 3–8 unless a screenshot in Checkpoint 8 proves otherwise:

- **Mobile, broadly** — every screen's mobile composition (< 768px). Changes only flow through
  where a *shared* component (e.g. a hover-state class that's already `web:`-scoped and inert on
  native) is touched — never a mobile-specific layout change.
- **Credit & Payments empty state** — verbatim, pixel for pixel.
- **Accounts row treatment** — icon, name, badges, balance, chevron, hover state: unchanged.
- **Budget desktop composition** — top summary + category-list panel + sidebar: unchanged
  structurally. Only the sidebar charts' internal polish changes (Checkpoint 5), and only
  Budget's *tablet* tier changes (§5).
- **Auth/onboarding composition** — the centered desktop card treatment from last pass: unchanged.
- **Black hero-card identity** — color, radius, typography: unchanged, reused via `HeroPanel`,
  never restyled or duplicated within a screen.
- **Settings' two-column composition** — unchanged structurally; consistency-only pass in
  Checkpoint 7.
- **`CommitmentRow`/`SettingsRow` hover treatments** — unchanged, the interaction-state baseline
  every new row-level component follows.
- **`DESKTOP_PANEL_CLASS`'s actual values** (border/radius/shadow) — unchanged; it becomes the
  canonical Level-1 token (§3), not replaced with something new.

---

## 12. Implementation architecture

**Shared primitives** (Checkpoint 3 — small, honestly scoped, not a mega-component):

| Primitive | Replaces | Used by |
|---|---|---|
| `SurfacePanel` component (formalizes `DESKTOP_PANEL_CLASS` into a real component instead of a class string glued onto a bare `View`) | ad-hoc `<View className={DESKTOP_PANEL_CLASS}>` | every Level-1 panel, all screens |
| `ContentRail` layout (primary/rail 2-column shape, parameterized by rail width) | Transactions' and Budget's own hand-rolled flex-row wrappers | **only** Transactions, Budget — explicitly not applied to any Shape-B screen |
| `SectionRow`/`InsetGroup` (Level-2 divider-separated row-group convention) | per-screen ad-hoc `border-t` Views | Installments' consolidated panel, Accounts' groups (where applicable), Goals' rows |
| Tablet 2-up wrap convention (documented `web:tablet:flex-row web:tablet:flex-wrap`, not a new component) | full-width stacking | Accounts, Installments at 834–1023 |
| `ForecastChart` width-awareness (a fix *inside* the existing component, not a new primitive) | fixed viewBox/tick-count | Cash Flow only |

**Per-screen only** (deliberately not extracted): Home's row-1/row-2 composition (too specific to
generalize); Recurring's card-reorder + row-level price-increase indicator; Obligations'
urgency-grouping (reuses existing `commitmentUrgency`, new only in how it's grouped); Transactions'
filter-disclosure interaction (if a second screen ever needs the identical shape, extract then —
not preemptively, matching the brief's own "don't create a giant abstraction to avoid a few
duplicated classes").

**Explicitly avoided:** one universal `<ScreenLayout variant="...">` component trying to cover
all nine screens through a prop API. The existing codebase's own convention is screens composing
`Card`/`HeroPanel`/etc. directly — this system keeps that shape, adding 3–4 named pieces rather
than one that tries to know about every screen's business logic.

---

## Open items carried into Checkpoint 3

1. Verify `max-w-[clamp(...)]`/`min()` arbitrary-value support in this NativeWind build before
   relying on it anywhere — until verified, desktop uses the fixed per-shape caps in §1. Checked
   now: no prior usage of `clamp(`/`min(` anywhere in this codebase (grepped `constants/`,
   `app/`, `features/`, `components/`) — genuinely untested territory here, confirming the
   fixed-cap-first decision rather than a reason to delay it further.
2. ~~Confirm `tabletLg: 1024px` doesn't collide with anything already keying off `1024`.~~
   Checked now: zero hits for a raw `1024` anywhere in `constants/`, `app/`, `features/`,
   `components/` — clear to add in Checkpoint 3.
3. Cash Flow's per-event marker positioning needs the chart's existing `xForIndex`/`yForBalance`
   math (already RTL-correct, already tested) — no new coordinate system, just new marks drawn
   with the same functions the low-point marker already uses.
