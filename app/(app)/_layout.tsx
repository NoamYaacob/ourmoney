import { Tabs, useRouter, useSegments } from 'expo-router'
import { Platform, Pressable, StyleSheet, Text, useWindowDimensions, View, type ColorValue } from 'react-native'
import { useColorScheme } from 'nativewind'
import { BlurView } from 'expo-blur'
import { Ionicons } from '@expo/vector-icons'
import type { ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { useBiometricGuard } from '@/features/auth/hooks/useBiometricGuard'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { useHousehold } from '@/features/household/hooks/useHousehold'
import { useTransactionsRealtimeSync } from '@/features/transactions/hooks/useTransactionsRealtimeSync'
import { useGenerateRecurringTransactions } from '@/features/recurring/hooks/useGenerateRecurringTransactions'
import { colors } from '@/constants/colors'
import { DESKTOP_BREAKPOINT_PX } from '@/constants/layout'

type RailHref =
  | '/dashboard'
  | '/transactions'
  | '/budgets'
  | '/settings'
  | '/cash-flow'
  | '/alerts'
  | '/recurring'
  | '/goals'
  | '/obligations'
  | '/accounts'

interface RailDestination {
  segment: string
  href: RailHref
  labelKey: string
  icon: ComponentProps<typeof Ionicons>['name']
  iconActive: ComponentProps<typeof Ionicons>['name']
}

interface RailGroup {
  key: string
  labelKey: string | null
  destinations: RailDestination[]
}

const RAIL_GROUPS: RailGroup[] = [
  {
    key: 'everyday',
    labelKey: null,
    destinations: [
      { segment: 'dashboard', href: '/dashboard', labelKey: 'tabs.dashboard', icon: 'home-outline', iconActive: 'home' },
      {
        segment: 'transactions',
        href: '/transactions',
        labelKey: 'tabs.transactions',
        icon: 'receipt-outline',
        iconActive: 'receipt',
      },
      { segment: 'budgets', href: '/budgets', labelKey: 'tabs.budgets', icon: 'wallet-outline', iconActive: 'wallet' },
    ],
  },
  {
    key: 'planning',
    labelKey: 'nav.groups.planning',
    destinations: [
      {
        segment: 'cash-flow',
        href: '/cash-flow',
        labelKey: 'nav.cashFlow',
        icon: 'trending-up-outline',
        iconActive: 'trending-up',
      },
      { segment: 'alerts', href: '/alerts', labelKey: 'nav.alerts', icon: 'notifications-outline', iconActive: 'notifications' },
      {
        segment: 'recurring',
        href: '/recurring',
        labelKey: 'settings.financial.recurring',
        icon: 'repeat-outline',
        iconActive: 'repeat',
      },
      { segment: 'goals', href: '/goals', labelKey: 'settings.financial.goals', icon: 'flag-outline', iconActive: 'flag' },
      {
        segment: 'obligations',
        href: '/obligations',
        labelKey: 'settings.financial.obligations',
        icon: 'calendar-outline',
        iconActive: 'calendar',
      },
    ],
  },
  {
    key: 'management',
    labelKey: 'nav.groups.management',
    destinations: [
      {
        segment: 'accounts',
        href: '/accounts',
        labelKey: 'settings.financial.accounts',
        icon: 'card-outline',
        iconActive: 'card',
      },
      { segment: 'settings', href: '/settings', labelKey: 'tabs.settings', icon: 'settings-outline', iconActive: 'settings' },
    ],
  },
]

export function DesktopSideRail({ activeSegment }: { activeSegment: string }) {
  const { t } = useTranslation()
  const router = useRouter()
  const { colorScheme: scheme } = useColorScheme()
  const activeColor = scheme === 'dark' ? colors.accent.dark : colors.accent.light
  const inactiveColor = scheme === 'dark' ? colors.inkMuted.dark : colors.inkMuted.light

  const quickActions = [
    { label: 'תנועה חדשה', icon: 'add-circle-outline' as const, onPress: () => router.push('/transactions/new') },
    { label: 'ייבוא CSV', icon: 'cloud-upload-outline' as const, onPress: () => router.push('/transactions/import') },
    { label: 'ניהול חשבונות', icon: 'card-outline' as const, onPress: () => router.push('/accounts') },
  ]

  return (
    <View className="sticky top-0 hidden h-screen w-[252px] shrink-0 border-s border-border-light bg-surfaceMuted-light/70 px-4 py-6 web:desktop:flex dark:border-border-dark dark:bg-surfaceMuted-dark/70">
      <View className="mb-6 px-3">
        <Text className="text-xl font-bold text-ink-light dark:text-ink-dark">OurMoney</Text>
        <Text className="mt-1 text-xs text-inkMuted-light dark:text-inkMuted-dark">הכסף של הבית, במקום אחד</Text>
      </View>

      <View className="mb-5 rounded-card border border-border-light bg-surface-light p-2 dark:border-border-dark dark:bg-surface-dark">
        <Text className="mb-1 px-2 pt-1 text-xs font-semibold text-inkMuted-light dark:text-inkMuted-dark">פעולות מהירות</Text>
        {quickActions.map((action) => (
          <Pressable
            key={action.label}
            onPress={action.onPress}
            accessibilityRole="button"
            className="flex-row items-center gap-2 rounded-control px-2.5 py-2 web:hover:bg-surfaceMuted-light dark:web:hover:bg-surfaceMuted-dark"
          >
            <Ionicons name={action.icon} size={19} color={activeColor} />
            <Text className="text-sm font-medium text-ink-light dark:text-ink-dark">{action.label}</Text>
          </Pressable>
        ))}
      </View>

      {RAIL_GROUPS.map((group) => (
        <View key={group.key} className="mb-4">
          {group.labelKey && (
            <Text className="mb-1 px-3 text-caption font-semibold text-inkMuted-light dark:text-inkMuted-dark">
              {t(group.labelKey)}
            </Text>
          )}
          {group.destinations.map((dest) => {
            const focused = dest.segment === activeSegment
            const color = focused ? activeColor : inactiveColor
            return (
              <Pressable
                key={dest.segment}
                onPress={() => router.push(dest.href)}
                accessibilityRole="button"
                accessibilityState={{ selected: focused }}
                className={`mb-1 flex-row items-center gap-3 rounded-control px-3 py-3 ${
                  focused
                    ? 'bg-accent-light/10 dark:bg-accent-dark/10'
                    : 'web:hover:bg-surface-light dark:web:hover:bg-surface-dark'
                }`}
              >
                <Ionicons name={focused ? dest.iconActive : dest.icon} color={color} size={22} />
                <Text className={focused ? 'text-body font-semibold' : 'text-body font-normal'} style={{ color }}>
                  {t(dest.labelKey)}
                </Text>
              </Pressable>
            )
          })}
        </View>
      ))}
    </View>
  )
}

function TabBarLabel({ title, focused, color }: { title: string; focused: boolean; color: ColorValue }) {
  return (
    <Text
      className={focused ? 'text-caption font-semibold' : 'text-caption font-normal'}
      style={{ color }}
      maxFontSizeMultiplier={1.8}
    >
      {title}
    </Text>
  )
}

export default function AppLayout() {
  const { t } = useTranslation()
  const { isLocked } = useBiometricGuard()
  const { user } = useAuth()
  const { householdId } = useHousehold(user?.id)
  useTransactionsRealtimeSync(householdId)
  useGenerateRecurringTransactions(householdId)
  const { colorScheme: scheme } = useColorScheme()
  const activeColor = scheme === 'dark' ? colors.accent.dark : colors.accent.light
  const inactiveColor = scheme === 'dark' ? colors.inkMuted.dark : colors.inkMuted.light
  const backgroundColor = scheme === 'dark' ? colors.surface.dark : colors.surface.light
  const borderColor = scheme === 'dark' ? colors.border.dark : colors.border.light
  const { width: windowWidth } = useWindowDimensions()
  const isWeb = Platform.OS === 'web'
  const isDesktopWeb = isWeb && windowWidth >= DESKTOP_BREAKPOINT_PX
  const segments = useSegments()
  const activeSegment = segments.at(1) ?? ''

  return (
    <>
      <View
        style={styles.flex}
        importantForAccessibility={isLocked ? 'no-hide-descendants' : 'auto'}
        accessibilityElementsHidden={isLocked}
      >
        <View className="flex-1 web:flex-row">
          {isWeb && <DesktopSideRail activeSegment={activeSegment} />}
          <View className="flex-1">
            <Tabs
              screenOptions={{
                headerShown: false,
                tabBarActiveTintColor: activeColor,
                tabBarInactiveTintColor: inactiveColor,
                tabBarStyle: isDesktopWeb
                  ? { display: 'none' }
                  : { backgroundColor, borderTopColor: borderColor },
              }}
            >
              <Tabs.Screen
                name="dashboard/index"
                options={{
                  title: t('tabs.dashboard'),
                  tabBarIcon: ({ color, size, focused }) => (
                    <Ionicons name={focused ? 'home' : 'home-outline'} color={color} size={size} />
                  ),
                  tabBarLabel: ({ focused, color }) => <TabBarLabel title={t('tabs.dashboard')} focused={focused} color={color} />,
                }}
              />
              <Tabs.Screen
                name="transactions/index"
                options={{
                  title: t('tabs.transactions'),
                  tabBarIcon: ({ color, size, focused }) => (
                    <Ionicons name={focused ? 'receipt' : 'receipt-outline'} color={color} size={size} />
                  ),
                  tabBarLabel: ({ focused, color }) => <TabBarLabel title={t('tabs.transactions')} focused={focused} color={color} />,
                }}
              />
              <Tabs.Screen
                name="budgets/index"
                options={{
                  title: t('tabs.budgets'),
                  tabBarIcon: ({ color, size, focused }) => (
                    <Ionicons name={focused ? 'wallet' : 'wallet-outline'} color={color} size={size} />
                  ),
                  tabBarLabel: ({ focused, color }) => <TabBarLabel title={t('tabs.budgets')} focused={focused} color={color} />,
                }}
              />
              <Tabs.Screen
                name="settings/index"
                options={{
                  title: t('tabs.settings'),
                  tabBarIcon: ({ color, size, focused }) => (
                    <Ionicons name={focused ? 'settings' : 'settings-outline'} color={color} size={size} />
                  ),
                  tabBarLabel: ({ focused, color }) => <TabBarLabel title={t('tabs.settings')} focused={focused} color={color} />,
                }}
              />
              <Tabs.Screen name="transactions/new" options={{ href: null }} />
              <Tabs.Screen name="transactions/[id]" options={{ href: null }} />
              <Tabs.Screen name="transfers/[id]" options={{ href: null }} />
              <Tabs.Screen name="transactions/import" options={{ href: null }} />
              <Tabs.Screen name="accounts/index" options={{ href: null }} />
              <Tabs.Screen name="accounts/[id]" options={{ href: null }} />
              <Tabs.Screen name="goals/index" options={{ href: null }} />
              <Tabs.Screen name="goals/[id]" options={{ href: null }} />
              <Tabs.Screen name="recurring/index" options={{ href: null }} />
              <Tabs.Screen name="recurring/[id]" options={{ href: null }} />
              <Tabs.Screen name="cash-flow/index" options={{ href: null }} />
              <Tabs.Screen name="alerts/index" options={{ href: null }} />
              <Tabs.Screen name="settings/categories" options={{ href: null }} />
              <Tabs.Screen name="obligations/index" options={{ href: null }} />
              <Tabs.Screen name="obligations/[id]" options={{ href: null }} />
            </Tabs>
          </View>
        </View>
      </View>
      {isLocked && (
        <BlurView intensity={80} pointerEvents="auto" accessibilityViewIsModal style={styles.overlay}>
          <View className="rounded-card bg-surface-light/90 px-6 py-4 dark:bg-surface-dark/90">
            <Text className="text-body text-ink-light dark:text-ink-dark">{t('auth.biometric.locked')}</Text>
          </View>
        </BlurView>
      )}
    </>
  )
}

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
