// Product-quality visual-refinement pass, Checkpoint 3 — the "Level 2"
// primitive from design-review/SYSTEM.md's surface hierarchy: a sub-region
// *inside* a SurfacePanel that needs visual separation without becoming a
// second bordered/shadowed box. Two concrete, already-proven-in-this-app
// shapes, one component:
//
//   - `tone="neutral"` — a plain sub-group (spacing only, no border/fill).
//     For splitting one Level-1 panel into side-by-side or stacked pieces
//     that are still one logical section — e.g. Installments' two
//     billing-cycle summaries consolidating into one panel (Checkpoint 6)
//     instead of each being its own bordered box.
//   - `tone="warning"` / `tone="danger"` — the semantically-tinted strip
//     pattern already hand-built twice this pass (Recurring's price-
//     increase notice, Cash Flow's shortfall-cause banner) — formalized
//     here so a third screen that needs the same "this needs attention,
//     but it's not a whole second alert card" treatment doesn't hand-roll
//     the border/radius/tint classes a third time.
//
// A plain divider-separated list of rows inside one panel (Installments'
// installment list, Settings' grouped rows) already has a working
// component — `Divider` — so this file doesn't duplicate that; it exists
// for the one thing Divider doesn't do, a bounded/tinted sub-region.
//
// Desktop-only by default, matching SurfacePanel — `web:desktop:`-scoped
// throughout, so mobile and tablet are unaffected unless a caller opts a
// specific group into the earlier `tier="tablet"` breakpoint (see
// SurfacePanel.tsx's own header comment — same tier prop, same reasoning:
// Installments' two billing-cycle groups are the one caller, matching its
// parent SurfacePanel's own `tier="tablet"`).
import type { ReactNode } from 'react'
import { View, type ViewProps } from 'react-native'
import { useInsideSurfacePanel, type SurfacePanelTier } from './SurfacePanel'

export type InsetGroupTone = 'neutral' | 'warning' | 'danger'

const BASE_CLASS: Record<SurfacePanelTier, string> = {
  desktop: 'web:desktop:rounded-row',
  tablet: 'web:tablet:rounded-row',
}

const TONE_CLASS: Record<SurfacePanelTier, Record<InsetGroupTone, string>> = {
  desktop: {
    neutral: '',
    warning:
      'web:desktop:border web:desktop:border-warningBorder-light web:desktop:bg-warningSurface-light web:desktop:p-4 dark:web:desktop:border-warningBorder-dark dark:web:desktop:bg-warningSurface-dark',
    danger:
      'web:desktop:border web:desktop:border-dangerBorder-light web:desktop:bg-dangerSurface-light web:desktop:p-4 dark:web:desktop:border-dangerBorder-dark dark:web:desktop:bg-dangerSurface-dark',
  },
  tablet: {
    neutral: '',
    warning:
      'web:tablet:border web:tablet:border-warningBorder-light web:tablet:bg-warningSurface-light web:tablet:p-4 dark:web:tablet:border-warningBorder-dark dark:web:tablet:bg-warningSurface-dark',
    danger:
      'web:tablet:border web:tablet:border-dangerBorder-light web:tablet:bg-dangerSurface-light web:tablet:p-4 dark:web:tablet:border-dangerBorder-dark dark:web:tablet:bg-dangerSurface-dark',
  },
}

interface InsetGroupProps extends ViewProps {
  children: ReactNode
  tone?: InsetGroupTone
  className?: string
  /** Breakpoint tier — must match the enclosing SurfacePanel's own `tier`. Defaults to `'desktop'` (unchanged). */
  tier?: SurfacePanelTier
}

export function InsetGroup({ children, tone = 'neutral', className, tier = 'desktop', ...viewProps }: InsetGroupProps) {
  const isInsidePanel = useInsideSurfacePanel()

  if (__DEV__ && !isInsidePanel) {
    console.warn(
      '[InsetGroup] Rendered outside a SurfacePanel. design-review/SYSTEM.md §3: ' +
        'Level 2 groups exist inside a Level-1 panel — if this region should stand on ' +
        'its own, it likely wants SurfacePanel instead.'
    )
  }

  return (
    <View className={`${BASE_CLASS[tier]} ${TONE_CLASS[tier][tone]} ${className ?? ''}`} {...viewProps}>
      {children}
    </View>
  )
}
