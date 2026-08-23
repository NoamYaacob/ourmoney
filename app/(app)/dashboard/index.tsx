// One route, two compositions.
//
// Mobile is not a narrowed desktop. The redesign brief was explicit that
// the phone gets its own structure — four curated blocks answering "where
// do I stand and what's next", rather than a grid of panels — so the two
// live in separate components instead of one layout wearing a pile of
// `web:desktop:` overrides. The desktop composition is the approved design
// and was moved across unchanged.
//
// Branching here, at the top, rather than early-returning inside either
// component: each then runs only its own hooks, so a phone never fires the
// desktop's six-month analytics query and a desktop browser never fires
// the mobile hero's.
//
// This file is deliberately thin, per CLAUDE.md § Component Architecture —
// screens in app/ compose feature components and own routing, nothing else.

import { Platform, useWindowDimensions } from 'react-native'
import { DESKTOP_BREAKPOINT_PX } from '@/constants/layout'
import { MobileHome } from '@/features/dashboard/components/MobileHome'
import { DesktopDashboard } from '@/features/dashboard/components/DesktopDashboard'

export default function Dashboard() {
  const { width } = useWindowDimensions()
  const isDesktopWeb = Platform.OS === 'web' && width >= DESKTOP_BREAKPOINT_PX

  return isDesktopWeb ? <DesktopDashboard /> : <MobileHome />
}
