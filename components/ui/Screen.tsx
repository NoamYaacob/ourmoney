// Replaces the hand-rolled SafeAreaView-less View/KeyboardAvoidingView
// wrapper duplicated across every M3/M4 screen (which approximated safe-area
// clearance with a hardcoded top padding — see the old dashboard placeholder)
// with a real SafeAreaView and the standard px-6 horizontal padding used
// throughout the app.

import type { ReactNode } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

interface ScreenProps {
  children: ReactNode
  scroll?: boolean
  center?: boolean
  keyboardAvoiding?: boolean
}

export function Screen({ children, scroll = true, center = false, keyboardAvoiding = false }: ScreenProps) {
  const content = scroll ? (
    <ScrollView
      contentContainerClassName={`px-6 pb-10 pt-6${center ? ' grow justify-center' : ''}`}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  ) : (
    <View className={`flex-1 px-6 pt-6${center ? ' items-center justify-center' : ''}`}>{children}</View>
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
    </SafeAreaView>
  )
}
