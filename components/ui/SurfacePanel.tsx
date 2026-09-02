// Product-quality visual-refinement pass, Checkpoint 3 — the "Level 1"
// primitive from design-review/SYSTEM.md's surface hierarchy: the one
// bordered/filled/shadowed container a logical section on a desktop screen
// gets. Formalizes what used to be two near-identical, independently-
// maintained class strings (DESKTOP_CARD_CLASS's rounded-hero/full-border/
// no-shadow, and DESKTOP_PANEL_CLASS's rounded-card/70%-border/shadow-sm)
// into one component with one set of values — DESKTOP_PANEL_CLASS's, the
// one Dashboard, Budget's sidebar, Transactions, Accounts, and Settings had
// already converged on before this pass. DESKTOP_CARD_CLASS is retired in
// this same commit (see constants/layout.ts) — every remaining caller
// migrates to this component, so there is exactly one Level-1 visual
// treatment left in the codebase, not two "almost the same" ones a future
// screen could pick between by accident.
//
// Desktop-only by default, like the class string it replaces: every class
// below is `web:desktop:`-scoped, so mobile and the whole 768-1199 tablet
// range are unaffected by a caller that doesn't opt in to an earlier tier —
// a screen that hasn't been migrated to use it yet renders identically to
// before. `web:tabletLg:` panel-shaped siblings for the rail layout live in
// ContentRail.tsx, not here — this component only ever draws Shape B's
// single-column Level-1 treatment.
//
// Checkpoint 6 fix: `tier="tablet"` opts a specific call site into the exact
// same values (border/radius/fill/shadow never change) keyed off
// `web:tablet:` (768px+, matching design-review/SYSTEM.md §2's 834px 2-up
// tier — `tablet` is the closest named breakpoint below it and the range
// between 768-833 already renders identically to the mobile composition
// with nothing to distinguish) instead of `web:desktop:`. Installments' two
// billing-cycle InsetGroups are the one caller that needs this — SYSTEM.md
// §5 documents the 2-up cycle-card composition starting at tablet, but the
// original desktop-only scoping left 834-1199 with zero surface/border/
// shadow at all (a real, disclosed visual defect, not a redesign). Default
// stays `'desktop'` so every other caller (DesktopCashFlow) is byte-for-
// byte unchanged.
//
// Nesting guard: `SurfacePanel.tsx`'s whole reason to exist is design-
// review/SYSTEM.md §3's rule that a Level-1 panel never contains another
// Level-1 panel — everything inside one is Level 2 (InsetGroup) or Level 3
// (a plain row), never a second bordered/shadowed box. A React Context flag
// makes that mistake loud in development instead of silently shipping a
// double-bordered box (the exact bug class fixed by hand, screen by screen,
// last pass) — nesting still renders (a dev warning must never crash the
// app a household is using), it just can't happen quietly.
import { createContext, useContext, type ReactNode } from 'react'
import { View, type ViewProps } from 'react-native'

export type SurfacePanelTier = 'desktop' | 'tablet'

const SURFACE_PANEL_CLASS: Record<SurfacePanelTier, string> = {
  desktop:
    'web:desktop:rounded-card web:desktop:border web:desktop:border-border-light/70 web:desktop:bg-surfaceMuted-light web:desktop:p-6 web:desktop:shadow-sm dark:web:desktop:border-border-dark/70 dark:web:desktop:bg-surfaceMuted-dark',
  tablet:
    'web:tablet:rounded-card web:tablet:border web:tablet:border-border-light/70 web:tablet:bg-surfaceMuted-light web:tablet:p-6 web:tablet:shadow-sm dark:web:tablet:border-border-dark/70 dark:web:tablet:bg-surfaceMuted-dark',
}

const InsideSurfacePanelContext = createContext(false)

/** True when rendered anywhere inside a `<SurfacePanel>` — `InsetGroup` reads this to confirm it's in the right place, and a nested `SurfacePanel` reads it to warn. */
export function useInsideSurfacePanel(): boolean {
  return useContext(InsideSurfacePanelContext)
}

interface SurfacePanelProps extends ViewProps {
  children: ReactNode
  /**
   * Additional layout-only classes composed alongside the fixed surface
   * treatment (e.g. `web:desktop:flex-1`, `web:desktop:mt-4`,
   * `web:desktop:min-h-[220px]`) — never pass border/background/radius/
   * shadow overrides here; that would reintroduce the exact ambiguity this
   * component exists to remove. If a screen genuinely needs a different
   * surface treatment, that's a new, deliberately-named Level (like the
   * hero surface `HeroPanel` already is), not a one-off override here.
   */
  className?: string
  /** Breakpoint the fixed surface treatment activates from. Defaults to `'desktop'` (1200px+, unchanged). Pass `'tablet'` (768px+) only when SYSTEM.md documents this section's own composition starting at tablet — see this file's own header comment. */
  tier?: SurfacePanelTier
}

export function SurfacePanel({ children, className, tier = 'desktop', ...viewProps }: SurfacePanelProps) {
  const isNested = useInsideSurfacePanel()

  if (__DEV__ && isNested) {
    console.warn(
      '[SurfacePanel] Rendered inside another SurfacePanel. design-review/SYSTEM.md §3: ' +
        'one Level-1 panel per logical section — nest an InsetGroup (Level 2) instead.'
    )
  }

  return (
    <InsideSurfacePanelContext.Provider value={true}>
      <View className={`${SURFACE_PANEL_CLASS[tier]} ${className ?? ''}`} {...viewProps}>
        {children}
      </View>
    </InsideSurfacePanelContext.Provider>
  )
}
