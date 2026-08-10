import { Tabs } from 'expo-router'
import { StyleSheet, Text, View } from 'react-native'
import { useColorScheme } from 'nativewind'
import { BlurView } from 'expo-blur'
import { Ionicons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { useBiometricGuard } from '@/features/auth/hooks/useBiometricGuard'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { useHousehold } from '@/features/household/hooks/useHousehold'
import { useTransactionsRealtimeSync } from '@/features/transactions/hooks/useTransactionsRealtimeSync'
import { colors } from '@/constants/colors'

// Milestone 5's real tab bar (Dashboard/Transactions/Budgets/Settings),
// replacing Milestone 1's single-screen Stack placeholder. The biometric
// re-lock overlay (PHASE_1_PLAN §3.7) stays an untouched sibling in the same
// fragment — it's absolutely positioned outside whatever navigator sits
// underneath it, so swapping Stack for Tabs doesn't affect it: the Tabs and
// its screens stay mounted while locked, so unlocking never re-triggers
// queries or loses scroll/tab position. No RTL-specific tab-bar logic is
// needed — I18nManager.forceRTL(true) already runs at root before anything
// renders, and React Navigation's bottom-tab-bar is a plain RN
// flexDirection:'row' layout, auto-mirrored under a forced RTL flag exactly
// like every other flex-row in this app (verified in Milestone 0).
//
// useColorScheme is imported from 'nativewind', NOT 'react-native' — see
// components/ui/Button.tsx's header comment for why.
//
// While locked, the Tabs subtree is hidden from the accessibility tree
// (importantForAccessibility/accessibilityElementsHidden) and the overlay is
// marked as a modal (accessibilityViewIsModal) — the BlurView's
// pointerEvents="auto" already blocks touches, but a screen reader navigates
// the accessibility tree independently of touch handling, so without this a
// VoiceOver/TalkBack user could still reach protected content underneath the
// blur (adversarial/mobile review finding).
export default function AppLayout() {
  const { t } = useTranslation()
  const { isLocked } = useBiometricGuard()
  const { user } = useAuth()
  const { householdId } = useHousehold(user?.id)
  useTransactionsRealtimeSync(householdId)
  const { colorScheme: scheme } = useColorScheme()
  const activeColor = scheme === 'dark' ? colors.accent.dark : colors.accent.light
  const inactiveColor = scheme === 'dark' ? colors.inkMuted.dark : colors.inkMuted.light
  const backgroundColor = scheme === 'dark' ? colors.surface.dark : colors.surface.light
  const borderColor = scheme === 'dark' ? colors.border.dark : colors.border.light

  return (
    <>
      <View
        style={styles.flex}
        importantForAccessibility={isLocked ? 'no-hide-descendants' : 'auto'}
        accessibilityElementsHidden={isLocked}
      >
        <Tabs
          screenOptions={{
            headerShown: false,
            tabBarActiveTintColor: activeColor,
            tabBarInactiveTintColor: inactiveColor,
            tabBarStyle: { backgroundColor, borderTopColor: borderColor },
          }}
        >
          <Tabs.Screen
            name="dashboard/index"
            options={{
              title: t('tabs.dashboard'),
              tabBarIcon: ({ color, size, focused }) => (
                <Ionicons name={focused ? 'home' : 'home-outline'} color={color} size={size} />
              ),
            }}
          />
          <Tabs.Screen
            name="transactions/index"
            options={{
              title: t('tabs.transactions'),
              tabBarIcon: ({ color, size, focused }) => (
                <Ionicons name={focused ? 'list' : 'list-outline'} color={color} size={size} />
              ),
            }}
          />
          <Tabs.Screen
            name="budgets/index"
            options={{
              title: t('tabs.budgets'),
              tabBarIcon: ({ color, size, focused }) => (
                <Ionicons name={focused ? 'wallet' : 'wallet-outline'} color={color} size={size} />
              ),
            }}
          />
          <Tabs.Screen
            name="settings/index"
            options={{
              title: t('tabs.settings'),
              tabBarIcon: ({ color, size, focused }) => (
                <Ionicons name={focused ? 'settings' : 'settings-outline'} color={color} size={size} />
              ),
            }}
          />
        </Tabs>
      </View>
      {isLocked && (
        <BlurView intensity={80} pointerEvents="auto" accessibilityViewIsModal style={styles.overlay}>
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
  flex: {
    flex: 1,
  },
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
