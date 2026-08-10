import { Stack } from 'expo-router'
import { StyleSheet, Text, View } from 'react-native'
import { BlurView } from 'expo-blur'
import { useTranslation } from 'react-i18next'
import { useBiometricGuard } from '@/features/auth/hooks/useBiometricGuard'

// A full tab bar (Dashboard/Transactions/Budgets/Settings) is Milestone 5.
// Milestone 1 has exactly one screen here — a Stack is the honest container.
// Milestone 3 adds the biometric re-lock overlay (PHASE_1_PLAN §3.7): the
// Stack and its screen stay mounted underneath the overlay while locked, so
// unlocking never re-triggers queries or loses scroll position.
export default function AppLayout() {
  const { t } = useTranslation()
  const { isLocked } = useBiometricGuard()

  return (
    <>
      <Stack screenOptions={{ headerShown: false }} />
      {isLocked && (
        <BlurView intensity={80} pointerEvents="auto" style={styles.overlay}>
          <View className="rounded-xl bg-surface-light/90 px-6 py-4 dark:bg-surface-dark/90">
            <Text className="text-base text-ink-light dark:text-ink-dark">{t('auth.biometric.locked')}</Text>
          </View>
        </BlurView>
      )}
    </>
  )
}

// NativeWind does not patch expo-blur's BlurView for `className` support
// (no cssInterop registration exists for it) — positioning has to be a real
// style, unlike the inner View/Text which NativeWind does patch by default.
const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    start: 0,
    end: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
