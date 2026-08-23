// The desktop header bar, drawn once for every screen.
//
// `OurMoney - Desktop.dc.html` renders this as a 68px white band across the
// top of the content column, with a hairline under it, and it is identical
// in every frame — the mockup's own note says the shell "is the same in all
// of them". It had been living inside the dashboard as a plain row on the
// paper background, which meant no other desktop screen had it and the one
// screen that did was missing the band, the border and the fixed height.
//
// Rendered by app/(app)/_layout.tsx above <Tabs>, so it sits beside the rail
// and above whatever screen is mounted. Web/desktop only: on a phone the
// design has a per-screen header and a bottom tab bar instead, and this
// component never mounts there.
//
// The month stepper appears only where a month is the screen's own context.
// On Transactions or Accounts a month control would be a lie — those screens
// are not scoped to one.

import { Pressable, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Ionicons } from '@expo/vector-icons'
import { useColorScheme } from 'nativewind'
import { colors } from '@/constants/colors'
import { usePeriodStore } from '@/store/periodStore'
import { formatMonthLabel, shiftMonth } from '@/features/budgets/lib/budgetPeriod'

// Screen title per route segment, matching the mockup's own header wording.
const TITLE_KEY_BY_SEGMENT: Record<string, string> = {
  dashboard: 'tabs.dashboard',
  transactions: 'tabs.transactions',
  budgets: 'tabs.budgets',
  'cash-flow': 'tabs.cashFlow',
  installments: 'nav.creditAndPayments',
  recurring: 'settings.financial.recurring',
  obligations: 'settings.financial.obligations',
  goals: 'settings.financial.goals',
  accounts: 'settings.financial.accounts',
  settings: 'tabs.settings',
  alerts: 'alerts.screenTitle',
  connections: 'connections.title',
  'safe-to-spend': 'safeToSpendDetail.title',
}

// Only these two are scoped to a single month in the design.
const MONTH_SCOPED_SEGMENTS = new Set(['dashboard', 'budgets'])

export function DesktopTopBar({ activeSegment }: { activeSegment: string }) {
  const { t } = useTranslation()
  const router = useRouter()
  const { colorScheme: scheme } = useColorScheme()
  const isDark = scheme === 'dark'
  const iconColor = isDark ? colors.inkMuted.dark : colors.inkMuted.light
  const periodStart = usePeriodStore((s) => s.selectedPeriodStart)
  const setPeriodStart = usePeriodStore((s) => s.setSelectedPeriodStart)

  const titleKey = TITLE_KEY_BY_SEGMENT[activeSegment]
  const showMonth = MONTH_SCOPED_SEGMENTS.has(activeSegment)

  return (
    <View className="hidden h-[68px] flex-none flex-row items-center gap-3.5 border-b border-border-light bg-surfaceMuted-light px-7 web:desktop:flex dark:border-border-dark dark:bg-surfaceMuted-dark">
      <Text className="font-heeboBold text-[20px] leading-[26px] text-ink-light dark:text-ink-dark">
        {titleKey ? t(titleKey) : ''}
      </Text>

      {showMonth && (
        <View className="ms-2.5 flex-row items-center gap-1.5 rounded-control bg-surface-light px-2.5 py-1.5 dark:bg-surface-dark">
          {/* chevron-back steps BACK in time. Under `dir="rtl"` the glyph
              itself points toward the start (right) edge, which reads as
              "earlier" — the same pairing the mockup's own stepper uses. */}
          <Pressable
            onPress={() => setPeriodStart(shiftMonth(periodStart, -1))}
            accessibilityRole="button"
            accessibilityLabel={t('dashboard.previousMonth')}
            className="h-6 w-6 items-center justify-center"
          >
            <Ionicons name="chevron-back" size={15} color={iconColor} />
          </Pressable>
          <Text className="text-caption font-sansSemibold text-ink-light dark:text-ink-dark">
            {formatMonthLabel(periodStart)}
          </Text>
          <Pressable
            onPress={() => setPeriodStart(shiftMonth(periodStart, 1))}
            accessibilityRole="button"
            accessibilityLabel={t('dashboard.nextMonth')}
            className="h-6 w-6 items-center justify-center"
          >
            <Ionicons name="chevron-forward" size={15} color={iconColor} />
          </Pressable>
        </View>
      )}

      <View className="ms-auto flex-row items-center gap-2.5">
        <Pressable
          onPress={() => router.push('/transactions')}
          accessibilityRole="button"
          accessibilityLabel={t('transactions.title')}
          className="w-[220px] flex-row items-center gap-2 rounded-control border border-border-light px-3 py-2.5 dark:border-border-dark"
        >
          <Ionicons name="search-outline" size={16} color={iconColor} />
          <Text className="text-bodySm text-inkMuted-light dark:text-inkMuted-dark" numberOfLines={1}>
            {t('dashboard.searchPlaceholder')}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => router.push('/transactions/new')}
          accessibilityRole="button"
          accessibilityLabel={t('transactions.addButton')}
          className="flex-row items-center gap-1.5 rounded-control bg-accent-light px-4 py-2.5 dark:bg-accent-dark"
        >
          <Ionicons name="add" size={17} color={isDark ? colors.hero.light : '#ffffff'} />
          <Text
            className="text-bodySm font-sansSemibold"
            style={{ color: isDark ? colors.hero.light : '#ffffff' }}
          >
            {t('transactions.addButton')}
          </Text>
        </Pressable>
      </View>
    </View>
  )
}
