// One route, two compositions — the third and last of these splits, and
// the one the brief was most explicit about: "do NOT reproduce the desktop
// transaction table" on mobile. Filters move into a sheet, rows group by
// date, and uncategorised transactions become a task strip rather than a
// sidebar note. The desktop screen is the approved design and moved across
// unchanged.
//
// Checkpoint 4 (Home + Transactions recompose): the switch point moved from
// DESKTOP_BREAKPOINT_PX (1200) to TABLET_LG_BREAKPOINT_PX (1024) — this is
// one of exactly two screens (with Home) that made this move; every other
// screen's own switch is untouched. DesktopTransactions' own composition is
// now written to look intentional starting at 1024 (its own header comment
// explains how), and DesktopTopBar shows its title band starting at 1024
// specifically for this route too — both needed to move together, or a
// styled table would have appeared under no page title.

import { Platform, useWindowDimensions } from 'react-native'
import { TABLET_LG_BREAKPOINT_PX } from '@/constants/layout'
import { MobileTransactions } from '@/features/transactions/components/MobileTransactions'
import { DesktopTransactions } from '@/features/transactions/components/DesktopTransactions'

export default function Transactions() {
  const { width } = useWindowDimensions()
  const isRichWeb = Platform.OS === 'web' && width >= TABLET_LG_BREAKPOINT_PX

  return isRichWeb ? <DesktopTransactions /> : <MobileTransactions />
}
