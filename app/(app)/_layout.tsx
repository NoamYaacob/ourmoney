import { Tabs, useRouter, useSegments } from 'expo-router'
import { Platform, Pressable, StyleSheet, Text, useWindowDimensions, View, type ColorValue } from 'react-native'
import { useColorScheme } from 'nativewind'
import { BlurView } from 'expo-blur'
import { Ionicons } from '@expo/vector-icons'
import type { ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { useBiometricGuard } from '@/features/auth/hooks/useBiometricGuard'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { useProfile } from '@/features/auth/hooks/useProfile'
import { useHousehold } from '@/features/household/hooks/useHousehold'
import { useHouseholdMembers } from '@/features/household/hooks/useHouseholdMembers'
import { useTransactionsRealtimeSync } from '@/features/transactions/hooks/useTransactionsRealtimeSync'
import { useGenerateRecurringTransactions } from '@/features/recurring/hooks/useGenerateRecurringTransactions'
import { useGenerateInstallmentTransactions } from '@/features/installments/hooks/useGenerateInstallmentTransactions'
import { useFinancialAlerts } from '@/features/alerts/hooks/useFinancialAlerts'
import { colors } from '@/constants/colors'
import { ICON } from '@/constants/icons'
import { DESKTOP_BREAKPOINT_PX } from '@/constants/layout'
import { Avatar } from '@/components/ui/Avatar'
import { DesktopTopBar } from '@/components/ui/DesktopTopBar'

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
  | '/installments'
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

// Desktop Claude Design pass: regrouped to match the approved mockup
// (`OurMoney - Desktop.dc.html`) exactly — one flat "everyday" list (בית ·
// תנועות · תקציב), one "תכנון" group in the mockup's own order (תזרים ·
// אשראי ותשלומים · חיובים קבועים · התחייבויות · יעדי חיסכון), one "משק בית"
// group (חשבונות · הגדרות). Two things this drops on purpose:
//   - The old separate "Insights" group/label — the mockup has no such
//     grouping; cash-flow belongs with the other planning destinations.
//   - Alerts as a sidebar destination — the approved design never puts it
//     in primary nav. It surfaces from the dashboard's own "דורש טיפול"
//     panel and from the Accounts screen instead; the route/screen itself
//     is unchanged, only its rail entry is gone.
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
      {
        segment: 'installments',
        href: '/installments',
        labelKey: 'nav.creditAndPayments',
        icon: 'card-outline',
        iconActive: 'card',
      },
      {
        segment: 'recurring',
        href: '/recurring',
        labelKey: 'settings.financial.recurring',
        icon: 'repeat-outline',
        iconActive: 'repeat',
      },
      {
        segment: 'obligations',
        href: '/obligations',
        labelKey: 'settings.financial.obligations',
        icon: 'calendar-outline',
        iconActive: 'calendar',
      },
      { segment: 'goals', href: '/goals', labelKey: 'settings.financial.goals', icon: 'flag-outline', iconActive: 'flag' },
    ],
  },
  {
    key: 'household',
    labelKey: 'nav.groups.household',
    destinations: [
      {
        segment: 'accounts',
        href: '/accounts',
        labelKey: 'settings.financial.accounts',
        icon: 'wallet-outline',
        iconActive: 'wallet',
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
  const mutedIconColor = scheme === 'dark' ? colors.inkMuted.dark : colors.inkMuted.light

  // Desktop Claude Design pass: the rail now carries the same household/user
  // identity the mockup's sidebar does (household name + member count up
  // top, the signed-in member's own name/role at the bottom) — the old rail
  // had neither, just a static "OurMoney" wordmark. Read-only display; no
  // new mutation, and the same hooks the mobile "עוד" screen already uses
  // for this exact data.
  const { user } = useAuth()
  const { displayName } = useProfile(user?.id)
  const { householdId, household, role } = useHousehold(user?.id)
  const { members } = useHouseholdMembers(householdId)

  return (
    // Desktop Claude Design pass: 228 -> 248px and the border moved from a
    // translucent tint to the flat `border-border-light` token, matching
    // the approved mockup's sidebar exactly (width:248px;border-inline-end:
    // 1px solid #E4E1D9 — the same hex constants/colors.ts's `border` token
    // already resolves to). Stays on the physical right under RTL — this
    // is the DOM-first child of the `flex-row-reverse` wrapper in
    // AppLayout below, unchanged from before this pass.
    <View className="sticky top-0 hidden h-screen w-[248px] shrink-0 border-s border-border-light bg-surfaceMuted-light px-3.5 py-5.5 web:desktop:flex dark:border-border-dark dark:bg-surfaceMuted-dark">
      <View className="mb-5 flex-row items-center gap-2.5 px-1.5">
        <View className="h-8 w-8 items-center justify-center rounded-control bg-ink-light dark:bg-ink-dark">
          <View className="h-2.5 w-2.5 rounded-[3px] bg-accent-light dark:bg-accent-dark" />
        </View>
        <View className="flex-1">
          <Text className="text-body font-heeboBold text-ink-light dark:text-ink-dark" numberOfLines={1}>
            {household?.name ?? t('nav.tagline')}
          </Text>
          {household && (
            <Text className="text-caption text-inkMuted-light dark:text-inkMuted-dark">
              {t('nav.householdSubtitle', { count: members.length })}
            </Text>
          )}
        </View>
      </View>

      {RAIL_GROUPS.map((group) => (
        <View key={group.key} className="mb-3">
          {group.labelKey && (
            <Text className="mb-1.5 mt-5 px-3 text-meta font-sansSemibold tracking-[0.1em] text-inkMuted-light dark:text-inkMuted-dark">
              {t(group.labelKey)}
            </Text>
          )}
          {group.destinations.map((dest) => {
            const focused = dest.segment === activeSegment
            const color = focused ? activeColor : mutedIconColor
            return (
              <Pressable
                key={dest.segment}
                onPress={() => router.push(dest.href)}
                accessibilityRole="button"
                accessibilityState={{ selected: focused }}
                // Desktop Claude Design pass: the selected row is now a
                // flat tint fill (bg-surface, no accent tint or leading
                // bar) matching the mockup's own selected-row treatment —
                // it marks the active destination with weight (font-600)
                // and an accent-colored icon, not a colored background.
                className={`mb-0.5 min-h-[40px] flex-row items-center gap-2.5 rounded-control px-3 py-2.5 ${
                  focused ? 'bg-surface-light dark:bg-surface-dark' : 'web:hover:bg-surface-light dark:web:hover:bg-surface-dark'
                }`}
              >
                <Ionicons name={focused ? dest.iconActive : dest.icon} color={color} size={ICON.nav} />
                <Text
                  className={focused ? 'text-body font-sansSemibold text-ink-light dark:text-ink-dark' : 'text-body font-sansMedium text-inkMuted-light dark:text-inkMuted-dark'}
                >
                  {t(dest.labelKey)}
                </Text>
              </Pressable>
            )
          })}
        </View>
      ))}

      <Pressable
        onPress={() => router.push('/settings')}
        accessibilityRole="button"
        accessibilityLabel={t('tabs.settings')}
        className="mt-auto flex-row items-center gap-2.5 border-t border-border-light pt-3.5 dark:border-border-dark"
      >
        <Avatar displayName={displayName ?? ''} size={32} />
        <View className="flex-1">
          <Text className="text-caption font-sansSemibold text-ink-light dark:text-ink-dark" numberOfLines={1}>
            {displayName}
          </Text>
          <Text className="text-meta text-inkMuted-light dark:text-inkMuted-dark">
            {role === 'admin' ? t('settings.household.roleAdmin') : t('settings.household.roleMember')}
          </Text>
        </View>
        <Ionicons name="ellipsis-horizontal" size={ICON.row} color={mutedIconColor} />
      </Pressable>
    </View>
  )
}

// "עוד" hides four destinations that can each carry something urgent, so
// the tab needs to say when one of them does — otherwise moving alerts off
// the bottom bar would have buried them.
//
// A dot, not a count. The number of alerts is not information a household
// can act on from the tab bar (is 3 worse than 2?), and a numeric badge on
// a permanent tab reads as a notification inbox, which the alerts section
// deliberately is not. The dot appears only for `critical` — the tier the
// engine reserves for "requires attention now" — so a routine info insight
// never lights up the navigation.
function MoreTabIcon({
  color,
  size,
  focused,
  householdId,
}: {
  color: ColorValue
  size: number
  focused: boolean
  householdId: string | null | undefined
}) {
  const { t } = useTranslation()
  const { alerts } = useFinancialAlerts(householdId)
  const criticalCount = alerts.filter((alert) => alert.severity === 'critical').length
  const { colorScheme: scheme } = useColorScheme()

  return (
    <View>
      <Ionicons name={focused ? 'grid' : 'grid-outline'} color={color} size={size} />
      {criticalCount > 0 && (
        <View
          // `end`, not `right` — the dot sits on the icon's trailing corner,
          // which mirrors with the rest of the RTL layout.
          style={[
            styles.moreBadge,
            { backgroundColor: scheme === 'dark' ? colors.danger.dark : colors.danger.light },
          ]}
          accessibilityLabel={t('alerts.badgeCritical', { count: criticalCount })}
        />
      )}
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
  useGenerateInstallmentTransactions(householdId)
  const { colorScheme: scheme } = useColorScheme()
  const activeColor = scheme === 'dark' ? colors.accent.dark : colors.accent.light
  const inactiveColor = scheme === 'dark' ? colors.inkMuted.dark : colors.inkMuted.light
  // Mobile redesign: the bar is a white card edge sitting on the paper, not
  // more paper — `surfaceMuted`, matching every other raised surface in the
  // product. On `surface` it had no edge of its own and the content
  // scrolled into it.
  const backgroundColor = scheme === 'dark' ? colors.surfaceMuted.dark : colors.surfaceMuted.light
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
        {/* DOM order is [rail, content], and a plain `flex-row` under the
            document's own `dir="rtl"` (set in app/_layout.tsx) puts the
            first-rendered child on the physical right — the correct RTL
            position for the rail, and the order a screen reader should meet
            it in. Deliberately NOT `flex-row-reverse`: that was the
            compensation for the web document being LTR, and on top of a real
            `dir="rtl"` it reverses a second time. Native is unaffected. */}
        <View className="flex-1 web:flex-row">
          {isWeb && <DesktopSideRail activeSegment={activeSegment} />}
          <View className="flex-1">
            {/* The mockup's 68px header band, identical on every desktop
                screen — see components/ui/DesktopTopBar.tsx. Rendered here,
                above the routed screen, so no individual screen draws its
                own (and so screens that previously had none now get it). */}
            {isWeb && <DesktopTopBar activeSegment={activeSegment} />}
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
                  // Mobile redesign: wallet -> pie-chart. `wallet` had come
                  // to mean two different things in one product (this tab,
                  // and "money available" everywhere else); this tab is
                  // about how the month divides up, which is what the design
                  // file's own icon says.
                  tabBarIcon: ({ color, size, focused }) => (
                    <Ionicons name={focused ? 'pie-chart' : 'pie-chart-outline'} color={color} size={size} />
                  ),
                  tabBarLabel: ({ focused, color }) => <TabBarLabel title={t('tabs.budgets')} focused={focused} color={color} />,
                }}
              />
              {/* Mobile redesign: תזרים was reachable only from the desktop
                  rail. It answers the question people open the app for
                  mid-month ("will the money last?"), so it earns a tab
                  rather than a row inside "עוד" — the one place this IA
                  deliberately departs from the brief's suggested five. */}
              <Tabs.Screen
                name="cash-flow/index"
                options={{
                  title: t('tabs.cashFlow'),
                  tabBarIcon: ({ color, size, focused }) => (
                    <Ionicons name={focused ? 'trending-up' : 'trending-up-outline'} color={color} size={size} />
                  ),
                  tabBarLabel: ({ focused, color }) => (
                    <TabBarLabel title={t('tabs.cashFlow')} focused={focused} color={color} />
                  ),
                }}
              />
              {/* Settings moved behind "עוד" with the other secondary
                  destinations. A household opens this app to look at money,
                  not to change preferences; a fifth of the bottom bar was
                  the old IA's least defensible line. */}
              <Tabs.Screen
                name="more/index"
                options={{
                  title: t('tabs.more'),
                  tabBarIcon: ({ color, size, focused }) => (
                    <MoreTabIcon color={color} size={size} focused={focused} householdId={householdId} />
                  ),
                  tabBarLabel: ({ focused, color }) => <TabBarLabel title={t('tabs.more')} focused={focused} color={color} />,
                }}
              />
              <Tabs.Screen name="settings/index" options={{ href: null }} />
              <Tabs.Screen name="safe-to-spend/index" options={{ href: null }} />
              <Tabs.Screen name="transactions/new" options={{ href: null }} />
              <Tabs.Screen name="transactions/[id]" options={{ href: null }} />
              <Tabs.Screen name="budgets/[categoryId]" options={{ href: null }} />
              <Tabs.Screen name="transfers/[id]" options={{ href: null }} />
              <Tabs.Screen name="transactions/import" options={{ href: null }} />
              <Tabs.Screen name="accounts/index" options={{ href: null }} />
              <Tabs.Screen name="accounts/[id]" options={{ href: null }} />
              <Tabs.Screen name="goals/index" options={{ href: null }} />
              <Tabs.Screen name="goals/[id]" options={{ href: null }} />
              <Tabs.Screen name="recurring/index" options={{ href: null }} />
              <Tabs.Screen name="recurring/[id]" options={{ href: null }} />
              <Tabs.Screen name="alerts/index" options={{ href: null }} />
              <Tabs.Screen name="settings/categories" options={{ href: null }} />
              <Tabs.Screen name="obligations/index" options={{ href: null }} />
              <Tabs.Screen name="obligations/[id]" options={{ href: null }} />
              <Tabs.Screen name="installments/index" options={{ href: null }} />
              <Tabs.Screen name="installments/[id]" options={{ href: null }} />
              <Tabs.Screen name="connections/index" options={{ href: null }} />
              <Tabs.Screen name="connections/preview" options={{ href: null }} />
              {/* Temporary investigation-only screen — see
                  app/(app)/diagnostics/index.tsx's own header. Not linked
                  from any nav; reachable only by navigating directly to
                  /diagnostics. */}
              <Tabs.Screen name="diagnostics/index" options={{ href: null }} />
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
  moreBadge: {
    position: 'absolute',
    top: -1,
    end: -3,
    width: 8,
    height: 8,
    borderRadius: 4,
  },
})
