// One route, two compositions — the same split as the dashboard, and for
// the same reason: the desktop screen is approved as it stands, and the
// phone needs a different structure rather than a narrower one. Mobile
// leads with the answer sentence and drops the second horizon selector
// (the safe-to-spend horizon lives on its own screen now), so it is a
// separate component instead of a stack of `web:desktop:` overrides.

import { Platform, useWindowDimensions } from 'react-native'
import { DESKTOP_BREAKPOINT_PX } from '@/constants/layout'
import { MobileCashFlow } from '@/features/cashflow/components/MobileCashFlow'
import { DesktopCashFlow } from '@/features/cashflow/components/DesktopCashFlow'

export default function CashFlow() {
  const { width } = useWindowDimensions()
  const isDesktopWeb = Platform.OS === 'web' && width >= DESKTOP_BREAKPOINT_PX

  return isDesktopWeb ? <DesktopCashFlow /> : <MobileCashFlow />
}
