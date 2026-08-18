// Replaces the hand-rolled SafeAreaView-less View/KeyboardAvoidingView
// wrapper duplicated across every M3/M4 screen (which approximated safe-area
// clearance with a hardcoded top padding — see the old dashboard placeholder)
// with a real SafeAreaView and the standard px-6 horizontal padding used
// throughout the app.

import type { ReactNode } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { CONTENT_WIDTH, type ContentWidth } from '@/constants/layout'

interface ScreenProps {
  children: ReactNode
  scroll?: boolean
  center?: boolean
  keyboardAvoiding?: boolean
  // Design Phase 2: a FAB (or similar floating control) rendered as an
  // ordinary child was scrolling away with the rest of the page — position:
  // 'absolute' inside a ScrollView positions relative to the *content*
  // container, which grows to fit all the scrollable content, not the
  // viewport. Rendering it here instead, as a sibling of the ScrollView,
  // anchors it to the SafeAreaView's own bounds so it actually stays fixed
  // above the tab bar. Wrapped in the same width clamp as the content below
  // so it lines up with the centered column on web instead of drifting to
  // the true edge of a wide browser window.
  floatingAction?: ReactNode
  // Responsive/desktop pass: which of the shared CONTENT_WIDTH tokens caps
  // this screen's content on web tablet/desktop. Defaults to 'narrow' — the
  // original single 560px clamp every screen had — so any call site that
  // doesn't pass this prop keeps its exact current appearance. Mobile is
  // always full width regardless of this prop.
  width?: ContentWidth
}

export function Screen({
  children,
  scroll = true,
  center = false,
  keyboardAvoiding = false,
  floatingAction,
  width = 'narrow',
}: ScreenProps) {
  // Design Phase 1: on native this is a no-op (web: variants only apply on
  // web), but on a wide browser window the app was stretching every screen
  // edge-to-edge like a desktop web app rather than the phone-shaped surface
  // it actually is. `web:mx-auto` centers a capped-width column instead —
  // applied here, once, so it covers every screen through the shared
  // primitive rather than each screen needing its own wrapper.
  const widthClamp = CONTENT_WIDTH[width]

  // Mobile-web polish: React Navigation's bottom tab bar occupies the bottom
  // of the viewport while Safari's dynamic browser chrome reduces the usable
  // visual area. The old pb-10 left the final card/form controls underneath
  // the tab bar, and a fixed FAB could cover the last meaningful row even
  // after scrolling. Keep native and desktop exactly as before, but reserve
  // extra scroll runway on web below the desktop breakpoint. A screen with a
  // floating action gets a little more so its final control can clear both
  // the tab bar and the FAB.
  const mobileWebBottomPadding = floatingAction
    ? 'pb-10 web:pb-32 web:desktop:pb-10'
    : 'pb-10 web:pb-24 web:desktop:pb-10'

  const content = scroll ? (
    <ScrollView
      contentContainerClassName={`${widthClamp} px-6 ${mobileWebBottomPadding} pt-6${center ? ' grow justify-center' : ''}`}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  ) : (
    <View className={`${widthClamp} flex-1 px-6 pt-6${center ? ' items-center justify-center' : ''}`}>{children}</View>
  )

  const wrapped = keyboardAvoiding ? (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
      {content}
    </KeyboardAvoidingView>
  ) : (
    content
  )

  return (
    <SafeAreaView className="flex-1 bg-surface-light dark:bg-surface-dark" edges={['top', 'bottom']}>
      {wrapped}
      {floatingAction && (
        <View pointerEvents="box-none" className={`${widthClamp} absolute inset-x-0 bottom-0 self-center`}>
          {floatingAction}
        </View>
      )}
    </SafeAreaView>
  )
}
