// One route, two compositions — the same split as the dashboard, and for
// the same reason: the desktop screen is approved as it stands, and the
// phone needs a different structure rather than a narrower one. Mobile
// leads with the answer sentence and drops the second horizon selector
// (the safe-to-spend horizon lives on its own screen now), so it is a
// separate component instead of a stack of `web:desktop:` overrides.
//
// Checkpoint 5 (Cash Flow + Budget + Accounts): the switch point moved from
// DESKTOP_BREAKPOINT_PX (1200) to TABLET_LG_BREAKPOINT_PX (1024) — the same
// move Checkpoint 4 made for Home and Transactions. DesktopCashFlow's own
// composition is written to look intentional starting at 1024 (its own
// header comment explains how), and DesktopTopBar shows its title band
// from 1024 specifically for this route too.

import { Platform, useWindowDimensions } from 'react-native'
import { TABLET_LG_BREAKPOINT_PX } from '@/constants/layout'
import { MobileCashFlow } from '@/features/cashflow/components/MobileCashFlow'
import { DesktopCashFlow } from '@/features/cashflow/components/DesktopCashFlow'

export default function CashFlow() {
  const { width } = useWindowDimensions()
  const isRichWeb = Platform.OS === 'web' && width >= TABLET_LG_BREAKPOINT_PX

  return isRichWeb ? <DesktopCashFlow /> : <MobileCashFlow />
}
