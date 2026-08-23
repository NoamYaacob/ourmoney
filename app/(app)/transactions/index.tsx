// One route, two compositions — the third and last of these splits, and
// the one the brief was most explicit about: "do NOT reproduce the desktop
// transaction table" on mobile. Filters move into a sheet, rows group by
// date, and uncategorised transactions become a task strip rather than a
// sidebar note. The desktop screen is the approved design and moved across
// unchanged.

import { Platform, useWindowDimensions } from 'react-native'
import { DESKTOP_BREAKPOINT_PX } from '@/constants/layout'
import { MobileTransactions } from '@/features/transactions/components/MobileTransactions'
import { DesktopTransactions } from '@/features/transactions/components/DesktopTransactions'

export default function Transactions() {
  const { width } = useWindowDimensions()
  const isDesktopWeb = Platform.OS === 'web' && width >= DESKTOP_BREAKPOINT_PX

  return isDesktopWeb ? <DesktopTransactions /> : <MobileTransactions />
}
