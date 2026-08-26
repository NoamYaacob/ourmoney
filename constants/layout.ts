// Responsive/desktop layout pass: shared content-width tokens so no screen
// hardcodes its own max-width literal. Mobile is always full width (existing
// appearance, unchanged) — these only take effect from `tablet` (>=768px)
// up, and only on `web` (native iPhone/iPad layout is untouched). `wide`
// grows further at `desktop` (>=1200px); `narrow` and `medium` intentionally
// stay flat so forms/settings never stretch that far.
export const CONTENT_WIDTH = {
  narrow: 'w-full web:tablet:max-w-[600px] web:tablet:mx-auto',
  medium: 'w-full web:tablet:max-w-[800px] web:tablet:mx-auto',
  wide: 'w-full web:tablet:max-w-[820px] web:tablet:mx-auto web:desktop:max-w-[1150px]',
  // Desktop Visual/Responsive Design pass: a dedicated tier for a grouped
  // multi-field form that wants real desktop width (2-up field rows) without
  // growing as wide as a dashboard/list screen's `wide` tier — New
  // Transaction is the one caller. `narrow` deliberately stays untouched
  // (its own single existing caller, transactions/new.tsx, is exactly what
  // this tier now replaces it with) rather than widening `narrow` itself,
  // which would have silently reversed this file's original "narrow/medium
  // intentionally stay flat" decision for every screen that defaults to it
  // (every detail/edit screen that renders a bare `<Screen>` with no width
  // prop) — a call this milestone's scope never asked for.
  form: 'w-full web:tablet:max-w-[600px] web:tablet:mx-auto web:desktop:max-w-[760px]',
  // Checkpoint 3 (product-quality visual-refinement pass, round 2): Shape B's
  // "richer" tier from design-review/SYSTEM.md §5 — Cash Flow and Accounts,
  // the two single-column screens whose content (a scaling chart; a 3-group
  // account grid) genuinely benefits from more width than `wide`'s 1150px
  // desktop cap deliberately restrains list/table screens to, without adding
  // a second column. `wide` is unchanged and keeps its ~16 existing callers;
  // this is a new, opt-in tier, not a redefinition. Goals/Obligations/
  // Recurring's "compact" tier (~760–820px, SYSTEM.md §5) reuses the
  // existing `medium` token below instead of adding a third — the numbers
  // already match.
  richSingle: 'w-full web:tablet:max-w-[900px] web:tablet:mx-auto web:desktop:max-w-[960px]',
} as const

export type ContentWidth = keyof typeof CONTENT_WIDTH

// Shared with the `desktop` Tailwind screen (tailwind.config.js) — the pixel
// value CSS-only `web:desktop:` classes can't cover on its own, needed
// wherever JS must branch on width directly (native style objects, Modal
// animationType, etc.) instead of via className.
export const DESKTOP_BREAKPOINT_PX = 1200

// Shared with the `tablet` Tailwind screen (tailwind.config.js) — same
// reasoning as DESKTOP_BREAKPOINT_PX above, for the handful of call sites
// that need to know "at least tablet width" in JS (an initial-state
// default, a native style object) rather than via `web:tablet:` className.
export const TABLET_BREAKPOINT_PX = 768

// Shared web width clamp for centered dialogs/sheets (Select's bottom
// sheet, the confirm Modal) — was duplicated as a literal in each caller.
// Applies at every web width (not just tablet/desktop): on a narrow mobile
// browser it's a no-op since the viewport is already under 560px; on a
// wider one it keeps the dialog from stretching edge to edge. Native mobile
// bottom-sheet behavior is untouched (no `web:` match off-web).
export const DIALOG_WIDTH_CLASS = 'web:max-w-[560px] web:self-center'

// Checkpoint 3 (product-quality visual-refinement pass, round 2): the
// `rounded-hero`/full-border/no-shadow Level-1 treatment that used to live
// here (DESKTOP_CARD_CLASS) is retired — its last 3 callers (Installments,
// DesktopCashFlow x2) migrated to `<SurfacePanel>`
// (components/ui/SurfacePanel.tsx), which uses DESKTOP_PANEL_CLASS's values
// below, the treatment every other desktop screen had already converged on.
// One Level-1 visual treatment now, not two near-identical ones a future
// screen could pick between by accident.

// Desktop polish pass: the bounded-panel treatment shared by Dashboard's
// and Budgets' lower-section columns — border/radius/fill/padding only.
// Each caller appends its own `web:desktop:min-h-[...]` (panel count and
// content differ per screen, so one shared floor height doesn't fit both).
//
// Visual QA + Desktop Polish pass: the border was previously full-strength
// (`border-border-light`, the same token used for hairline dividers) with
// no shadow at all — every panel on Dashboard/Budgets/Settings read as a
// heavy outlined box. Softened to a lighter border tint plus the same
// `shadow-sm` Card.tsx already carries (BASE_CARD_CLASS), so panels read as
// subtle depth/elevation rather than a hard outline — matching the rest of
// the app's card language instead of predating it.
export const DESKTOP_PANEL_CLASS =
  'web:desktop:rounded-card web:desktop:border web:desktop:border-border-light/70 web:desktop:bg-surfaceMuted-light web:desktop:p-6 web:desktop:shadow-sm dark:web:desktop:border-border-dark/70 dark:web:desktop:bg-surfaceMuted-dark'

// Visual QA + Desktop Polish pass: the same `web:desktop:max-w-[600px]`
// literal was independently duplicated across Recurring/Goals/Obligations/
// Alerts/Accounts (each wrapping its own inline add/edit form or list,
// never the whole `<Screen>`) — a per-screen magic number, not a shared
// token. This is deliberately NOT one of the CONTENT_WIDTH tiers above:
// those clamp a `<Screen>`'s own root content column (`w-full ... mx-auto`,
// active from `tablet` up), while every one of these call sites wraps an
// inner `<View>` that already sits inside a wider `Screen` (`wide`) and
// only ever needs the desktop-only cap itself.
//
// Product-quality pass: a real-browser review of Accounts' inline "add
// account" state (the clearest example of the problem, but structurally
// identical on every other caller) found a narrow, edge-aligned form
// sitting in a huge blank desktop canvas — a mobile-width block dropped
// onto a wide screen, not a composed desktop panel. `mx-auto` centers it
// as a deliberate, self-contained panel instead; the width itself is
// unchanged; every caller's <Card> already gives it the bordered/radiused
// surface a centered panel needs; the same rule now applies to the
// collapsed "add" button too (the sibling state on every one of these
// screens), so opening the form doesn't visually jump from one alignment
// to another.
export const INLINE_FORM_WIDTH_CLASS = 'web:desktop:max-w-[600px] web:desktop:mx-auto'
