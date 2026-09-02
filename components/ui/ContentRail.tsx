// Product-quality visual-refinement pass, Checkpoint 3 — the "Shape A"
// layout primitive from design-review/SYSTEM.md §1/§5: a primary column
// beside a fixed-width contextual rail. Reserved for the two screens
// Checkpoint 1/2 found a genuine second data category for — Transactions
// (net figure + active classification rules) and Budget (category
// breakdown + trend + uncategorized queue) — not a general-purpose
// two-column layout for any screen with spare width. Every other
// Checkpoint-1 RECOMPOSE screen stays single-column by deliberate decision
// (§6 of SYSTEM.md); do not reach for this component there.
//
// Checkpoint 4: Transactions is now the first live consumer. Adopting it
// required moving Transactions' OWN JS mobile/desktop switch from
// DESKTOP_BREAKPOINT_PX (1200) to TABLET_LG_BREAKPOINT_PX (1024) — see that
// screen's own header comment — which is what makes ContentRail's stacked
// state below actually reachable now (previously it never was; every caller
// mounted its desktop component only at >=1200, above where ContentRail
// would ever stack). Budget adopts this same primitive in Checkpoint 5.
//
// Width strategy: fixed caps per breakpoint tier, not a fluid clamp() —
// SYSTEM.md §1 explains why (unverified in this NativeWind build; a fixed
// cap is the conservative, already-proven-safe choice). Desktop cap is
// 1390px (SYSTEM.md §1's "~1390px at 1920"), not 1150 — Shape A is meant to
// grow beyond the flat single-column `wide` tier as viewport grows; a
// caller using this component must not also apply CONTENT_WIDTH's own
// clamp on top of it (see CONTENT_WIDTH.full's own comment). RTL: plain
// `flex-row`, not `flex-row-reverse` — this codebase's own established
// pattern (see Modal.tsx's identical reasoning) is that a plain row under
// the app's global `direction: rtl` already places the first JSX child
// (the primary column) on the visual right, which is where the dominant
// content belongs in RTL reading order; reversing it would place primary
// on the left, backwards.
//
// Below `tabletLg` (1024px): primary and rail simply stack, full width,
// primary first — the same "read top to bottom" order a phone would use.
import type { ReactNode } from 'react'
import { View } from 'react-native'

// Exported so a sibling that needs to align to this same column —
// Transactions' filter toolbar sits above the rail row, not inside it — can
// share the exact width/centering numbers instead of re-guessing them. Only
// the cap+center half of the root class below; the row/gap behavior is
// Shape-A specific and stays private to the component itself.
export const CONTENT_RAIL_WIDTH_CLASS = 'w-full web:tabletLg:mx-auto web:tabletLg:max-w-[1050px] web:desktop:max-w-[1390px]'

interface ContentRailProps {
  primary: ReactNode
  rail: ReactNode
  /** Layout-only classes on the outer wrapper (e.g. `web:desktop:mt-6`). */
  className?: string
}

export function ContentRail({ primary, rail, className }: ContentRailProps) {
  return (
    <View className={`${CONTENT_RAIL_WIDTH_CLASS} web:tabletLg:flex-row web:tabletLg:gap-6 web:desktop:gap-8 ${className ?? ''}`}>
      <View className="web:tabletLg:min-w-0 web:tabletLg:flex-1">{primary}</View>
      <View className="web:tabletLg:mt-0 web:tabletLg:w-[280px] web:tabletLg:flex-none web:desktop:w-80 mt-6">{rail}</View>
    </View>
  )
}
