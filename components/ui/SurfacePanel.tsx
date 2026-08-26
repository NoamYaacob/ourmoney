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
// Desktop-only, like the class string it replaces: every class below is
// `web:desktop:`-scoped, so mobile and the whole 768-1199 tablet range are
// completely unaffected by this component existing — a screen that hasn't
// been migrated to use it yet (nothing has, as of this commit) renders
// identically to before. `web:tabletLg:` panel-shaped siblings for the rail
// layout live in ContentRail.tsx, not here — this component only ever
// draws the *desktop* Level-1 treatment.
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

const SURFACE_PANEL_CLASS =
  'web:desktop:rounded-card web:desktop:border web:desktop:border-border-light/70 web:desktop:bg-surfaceMuted-light web:desktop:p-6 web:desktop:shadow-sm dark:web:desktop:border-border-dark/70 dark:web:desktop:bg-surfaceMuted-dark'

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
}

export function SurfacePanel({ children, className, ...viewProps }: SurfacePanelProps) {
  const isNested = useInsideSurfacePanel()

  if (__DEV__ && isNested) {
    console.warn(
      '[SurfacePanel] Rendered inside another SurfacePanel. design-review/SYSTEM.md §3: ' +
        'one Level-1 panel per logical section — nest an InsetGroup (Level 2) instead.'
    )
  }

  return (
    <InsideSurfacePanelContext.Provider value={true}>
      <View className={`${SURFACE_PANEL_CLASS} ${className ?? ''}`} {...viewProps}>
        {children}
      </View>
    </InsideSurfacePanelContext.Provider>
  )
}
