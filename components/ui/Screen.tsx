// Replaces the hand-rolled SafeAreaView-less View/KeyboardAvoidingView
// wrapper duplicated across every M3/M4 screen with a real SafeAreaView and
// one shared responsive page gutter.

import type { ReactNode } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { CONTENT_WIDTH, type ContentWidth } from '@/constants/layout'

interface ScreenProps {
  children: ReactNode
  scroll?: boolean
  center?: boolean
  keyboardAvoiding?: boolean
  floatingAction?: ReactNode
  width?: ContentWidth
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
}: ScreenProps) {
  const widthClamp = CONTENT_WIDTH[width]
  const mobileWebBottomPadding = screenBottomPaddingClass(Boolean(floatingAction))
  const pageClass = `${widthClamp} px-6 web:desktop:px-8 ${mobileWebBottomPadding} pt-6 web:desktop:pt-9${
    center ? ' grow justify-center' : ''
  }`

  const content = scroll ? (
    <ScrollView
      contentContainerClassName={pageClass}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  ) : (
    <View
      className={`${widthClamp} flex-1 px-6 pt-6 web:desktop:px-8 web:desktop:pt-9${
        center ? ' items-center justify-center' : ''
      }`}
    >
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
