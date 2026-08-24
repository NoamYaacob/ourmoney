// Replaces the hand-rolled SafeAreaView-less View/KeyboardAvoidingView
// wrapper duplicated across every M3/M4 screen with a real SafeAreaView and
// one shared responsive page gutter.

import type { ReactNode } from 'react'
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { useColorScheme } from 'nativewind'
import { colors } from '@/constants/colors'
import { ICON } from '@/constants/icons'
import { useRTL } from '@/hooks/useRTL'
import { CONTENT_WIDTH, type ContentWidth } from '@/constants/layout'
import { OfflineBanner } from './OfflineBanner'

interface ScreenProps {
  children: ReactNode
  scroll?: boolean
  center?: boolean
  keyboardAvoiding?: boolean
  floatingAction?: ReactNode
  width?: ContentWidth
  // A real back control, mobile only — desktop reaches every screen from
  // the always-visible side rail instead (see DesktopTopBar.tsx), and both
  // Mobile.dc.html's chevron-back (negative-margin, 44px hit target) and
  // the platform's own back gesture/hardware-back already exist there, so
  // this is additive, not a replacement for either. Every nested/detail
  // route previously had `headerShown:false` (app/(app)/_layout.tsx) and
  // Screen itself drew no header at all — a household on web (no hardware
  // back, no swipe gesture) had no in-app way off a detail screen except
  // the browser's own back button.
  onBack?: () => void
}

export function screenBottomPaddingClass(hasFloatingAction: boolean): string {
  return hasFloatingAction
    ? 'pb-10 web:pb-32 web:desktop:pb-12'
    : 'pb-10 web:pb-24 web:desktop:pb-12'
}

export function Screen({
  children,
  scroll = true,
  center = false,
  keyboardAvoiding = false,
  floatingAction,
  width = 'narrow',
  onBack,
}: ScreenProps) {
  const { t } = useTranslation()
  const { flip } = useRTL()
  const { colorScheme: scheme } = useColorScheme()
  const iconColor = scheme === 'dark' ? colors.ink.dark : colors.ink.light
  const widthClamp = CONTENT_WIDTH[width]
  const mobileWebBottomPadding = screenBottomPaddingClass(Boolean(floatingAction))
  const pageClass = `${widthClamp} px-6 web:desktop:px-8 ${mobileWebBottomPadding} pt-6 web:desktop:pt-9${
    center ? ' grow justify-center' : ''
  }`

  const backButton = onBack && (
    <Pressable
      onPress={onBack}
      accessibilityRole="button"
      accessibilityLabel={t('common.back')}
      // The design's own -10px trick (chevron-back sits flush with the
      // content column, but its actual tap target extends past it) —
      // without this the glyph looks indented rather than leading the row.
      className="-ms-2.5 mb-1 h-11 w-11 items-center justify-center web:desktop:hidden"
    >
      <Ionicons name={flip('chevron-back', 'chevron-forward')} size={ICON.nav} color={iconColor} />
    </Pressable>
  )

  const content = scroll ? (
    <ScrollView
      contentContainerClassName={pageClass}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {backButton}
      {children}
    </ScrollView>
  ) : (
    <View
      className={`${widthClamp} flex-1 px-6 pt-6 web:desktop:px-8 web:desktop:pt-9${
        center ? ' items-center justify-center' : ''
      }`}
    >
      {backButton}
      {children}
    </View>
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
      <OfflineBanner />
      {wrapped}
      {floatingAction && (
        <View
          pointerEvents="box-none"
          className={`${widthClamp} absolute inset-x-0 bottom-0 self-center web:desktop:bottom-4`}
        >
          {floatingAction}
        </View>
      )}
    </SafeAreaView>
  )
}
