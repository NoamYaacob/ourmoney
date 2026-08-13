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

const DESKTOP_BREAKPOINT = 1200

interface RailDestination {
  segment: string
  href: '/dashboard' | '/transactions' | '/budgets' | '/settings'
  labelKey: 'tabs.dashboard' | 'tabs.transactions' | 'tabs.budgets' | 'tabs.settings'
  icon: ComponentProps<typeof Ionicons>['name']
  iconActive: ComponentProps<typeof Ionicons>['name']
}

const RAIL_DESTINATIONS: RailDestination[] = [
  { segment: 'dashboard', href: '/dashboard', labelKey: 'tabs.dashboard', icon: 'home-outline', iconActive: 'home' },
  { segment: 'transactions', href: '/transactions', labelKey: 'tabs.transactions', icon: 'receipt-outline', iconActive: 'receipt' },
  { segment: 'budgets', href: '/budgets', labelKey: 'tabs.budgets', icon: 'wallet-outline', iconActive: 'wallet' },
  { segment: 'settings', href: '/settings', labelKey: 'tabs.settings', icon: 'settings-outline', iconActive: 'settings' },
]

// Responsive/desktop pass: replaces the bottom tab bar with a left/right
// (RTL-aware) side rail at the `desktop` breakpoint on web only — same 4
// destinations, no hidden routes exposed. Only ever mounted when
// `Platform.OS === 'web'` (see AppLayout below), so it never renders under
// jest-expo's default native platform and can't affect
// `_layout.test.tsx`'s "exactly 4 tab buttons" assertion. `flex-row` (not
// `flex-row-reverse`) auto-mirrors to the right edge under the app's forced
// RTL flag, matching this codebase's established RTL convention.
export function DesktopSideRail({ activeSegment }: { activeSegment: string }) {
  const { t } = useTranslation()
  const router = useRouter()
  const { colorScheme: scheme } = useColorScheme()
  const activeColor = scheme === 'dark' ? colors.accent.dark : colors.accent.light
  const inactiveColor = scheme === 'dark' ? colors.inkMuted.dark : colors.inkMuted.light

  return (
    <View className="hidden web:desktop:flex w-[220px] shrink-0 border-e border-border-light bg-surface-light px-3 pt-8 dark:border-border-dark dark:bg-surface-dark">
      {RAIL_DESTINATIONS.map((dest) => {
        const focused = dest.segment === activeSegment
        const color = focused ? activeColor : inactiveColor
        return (
          <Pressable
            key={dest.segment}
            onPress={() => router.push(dest.href)}
            accessibilityRole="button"
            accessibilityState={{ selected: focused }}
            className={`mb-1 flex-row items-center gap-3 rounded-control px-3 py-2.5 ${focused ? 'bg-surfaceMuted-light dark:bg-surfaceMuted-dark' : ''}`}
          >
            <Ionicons name={focused ? dest.iconActive : dest.icon} color={color} size={22} />
            <Text className={focused ? 'text-body font-semibold' : 'text-body font-normal'} style={{ color }}>
              {t(dest.labelKey)}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

// Design Phase 1: the active tab previously read only from the icon/label
// tint swap, which is faint at a glance. Bolding the active label adds a
// second, independent active-state cue (weight, not just hue) without
// touching layout — labelStyle itself can't key off `focused`, so this
// renders the label directly. A standalone named component (rather than a
// factory returning an inline arrow function) so it has a display name for
// React DevTools/lint, and so its identity is stable across AppLayout's
// re-renders instead of being recreated as a new closure every time.
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
// Expo Router auto-registers every route FILE physically present under this
// directory as a tab unless that route explicitly opts out via
// `options={{ href: null }}` — confirmed root cause of a reported bug: every
// non-tab screen below (accounts, goals, recurring, settings/categories,
// and every transactions/* screen except the list) was leaking into the tab
// bar as an extra, unlabeled, raw-route-name tab. Each of those screens'
// own file header already documented the intent ("reached from Settings,
// not a tab" — accounts/index.tsx, goals/index.tsx, recurring/index.tsx,
// settings/categories.tsx); this was a missing exclusion, not a design
// change. `href: null` removes a route from the tab bar (and from the
// header back-button's "up" target) while leaving it fully reachable via
// router.push/router.replace exactly as it already was.
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
  // Milestone 7 — client-on-open recurring generation (ADR-003/Q2). Mounted
  // once here, next to the realtime sync, for the same reason: this hook
  // owns its own subscribe/trigger lifecycle, so it must not be mounted
  // more than once (would just mean redundant, harmlessly idempotent RPC
  // calls, but still — one owner, matching the realtime sync's convention).
  useGenerateRecurringTransactions(householdId)
  const { colorScheme: scheme } = useColorScheme()
  const activeColor = scheme === 'dark' ? colors.accent.dark : colors.accent.light
  const inactiveColor = scheme === 'dark' ? colors.inkMuted.dark : colors.inkMuted.light
  const backgroundColor = scheme === 'dark' ? colors.surface.dark : colors.surface.light
  const borderColor = scheme === 'dark' ? colors.border.dark : colors.border.light
  // Responsive/desktop pass: `tabBarStyle` is a plain native style object,
  // not a className, so hiding the bottom bar only at the desktop
  // breakpoint needs an actual width read rather than a CSS media query —
  // this is the one nav-shell decision that needs it (per the task brief's
  // own fallback guidance), everything else in this pass stays CSS-driven.
  // The DesktopSideRail's own visibility is still purely CSS
  // (`hidden web:desktop:flex`); this value only controls the bottom bar.
  const { width: windowWidth } = useWindowDimensions()
  const isWeb = Platform.OS === 'web'
  const isDesktopWeb = isWeb && windowWidth >= DESKTOP_BREAKPOINT
  // segments[0] is the '(app)' route group; segments[1] is the tab root
  // ('dashboard' | 'transactions' | 'budgets' | 'settings' | ...).
  const segments = useSegments()
  const activeSegment = segments[1] ?? ''

  return (
    <>
      <View
        style={styles.flex}
        importantForAccessibility={isLocked ? 'no-hide-descendants' : 'auto'}
        accessibilityElementsHidden={isLocked}
      >
        {/* `web:flex-row` no-ops on native (Platform.OS !== 'web' never
            matches the variant), so this wrapper is a plain flex:1 column —
            byte-identical to the previous single View — everywhere except a
            real web build. The side rail itself is only ever mounted when
            Platform.OS === 'web', so native's render tree (and
            `_layout.test.tsx`'s exactly-4-tab-buttons assertion, which runs
            under jest-expo's default native platform) is completely
            unaffected. */}
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
                  // receipt reads as "line-item money movements" — more coherent
                  // with the tab's actual content than the generic list glyph.
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
              {/* Every screen below is reached via router.push from Settings (or
                  from a list screen's own row), never as a tab — excluded from
                  the tab bar via href: null. See this file's own header comment. */}
              <Tabs.Screen name="transactions/new" options={{ href: null }} />
              <Tabs.Screen name="transactions/[id]" options={{ href: null }} />
              <Tabs.Screen name="transactions/import" options={{ href: null }} />
              <Tabs.Screen name="accounts/index" options={{ href: null }} />
              <Tabs.Screen name="accounts/[id]" options={{ href: null }} />
              <Tabs.Screen name="goals/index" options={{ href: null }} />
              <Tabs.Screen name="goals/[id]" options={{ href: null }} />
              <Tabs.Screen name="recurring/index" options={{ href: null }} />
              <Tabs.Screen name="recurring/[id]" options={{ href: null }} />
              <Tabs.Screen name="settings/categories" options={{ href: null }} />
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
