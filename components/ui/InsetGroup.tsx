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
// Desktop-only, matching SurfacePanel — `web:desktop:`-scoped throughout,
// so mobile and tablet are unaffected regardless of where this is used.
import type { ReactNode } from 'react'
import { View, type ViewProps } from 'react-native'
import { useInsideSurfacePanel } from './SurfacePanel'

export type InsetGroupTone = 'neutral' | 'warning' | 'danger'

const TONE_CLASS: Record<InsetGroupTone, string> = {
  neutral: '',
  warning:
    'web:desktop:border web:desktop:border-warningBorder-light web:desktop:bg-warningSurface-light web:desktop:p-4 dark:web:desktop:border-warningBorder-dark dark:web:desktop:bg-warningSurface-dark',
  danger:
    'web:desktop:border web:desktop:border-dangerBorder-light web:desktop:bg-dangerSurface-light web:desktop:p-4 dark:web:desktop:border-dangerBorder-dark dark:web:desktop:bg-dangerSurface-dark',
}

interface InsetGroupProps extends ViewProps {
  children: ReactNode
  tone?: InsetGroupTone
  className?: string
}

export function InsetGroup({ children, tone = 'neutral', className, ...viewProps }: InsetGroupProps) {
  const isInsidePanel = useInsideSurfacePanel()

  if (__DEV__ && !isInsidePanel) {
    console.warn(
      '[InsetGroup] Rendered outside a SurfacePanel. design-review/SYSTEM.md §3: ' +
        'Level 2 groups exist inside a Level-1 panel — if this region should stand on ' +
        'its own, it likely wants SurfacePanel instead.'
    )
  }

  return (
    <View className={`web:desktop:rounded-row ${TONE_CLASS[tone]} ${className ?? ''}`} {...viewProps}>
      {children}
    </View>
  )
}
