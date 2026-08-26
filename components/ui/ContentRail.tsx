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
// Not yet used by any screen as of this commit (Checkpoint 3 is primitives
// only) — Transactions and Budget adopt it in Checkpoints 4/5. Built and
// verified in isolation: unit-tested class output, and the underlying
// `tabletLg`/`desktop` Tailwind breakpoints confirmed present in the
// compiled CSS (see the Checkpoint 3 report for how).
//
// Width strategy: fixed caps per breakpoint tier, not a fluid clamp() —
// SYSTEM.md §1 explains why (unverified in this NativeWind build; a fixed
// cap is the conservative, already-proven-safe choice). RTL: plain
// `flex-row`, not `flex-row-reverse` — this codebase's own established
// pattern (see Modal.tsx's identical reasoning) is that a plain row under
// the app's global `direction: rtl` already places the first JSX child
// (the primary column) on the visual right, which is where the dominant
// content belongs in RTL reading order; reversing it would place primary
// on the left, backwards.
//
// Below `tabletLg` (1024px): primary and rail simply stack, full width,
// primary first — the same "read top to bottom" order a phone would use.
// A screen rendering its *mobile* component below this width (which is how
// this app is actually structured — see app/(app)/transactions/index.tsx's
// isDesktopWeb switch) won't reach this stacked state in practice; it's
// here so ContentRail behaves sensibly if a caller ever renders it at a
// narrower width than its two target callers currently do.
import type { ReactNode } from 'react'
import { View } from 'react-native'

interface ContentRailProps {
  primary: ReactNode
  rail: ReactNode
  /** Layout-only classes on the outer wrapper (e.g. `web:desktop:mt-6`). */
  className?: string
}

export function ContentRail({ primary, rail, className }: ContentRailProps) {
  return (
    <View
      className={`w-full web:tabletLg:flex-row web:tabletLg:mx-auto web:tabletLg:max-w-[1050px] web:tabletLg:gap-6 web:desktop:max-w-[1320px] web:desktop:gap-8 ${className ?? ''}`}
    >
      <View className="web:tabletLg:min-w-0 web:tabletLg:flex-1">{primary}</View>
      <View className="web:tabletLg:mt-0 web:tabletLg:w-[280px] web:tabletLg:flex-none web:desktop:w-80 mt-6">{rail}</View>
    </View>
  )
}
