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
// The bar's ACTIONS are per screen, exactly as the mockup draws them. Its
// three full-shell frames each differ: Home carries [title · month · search ·
// תנועה חדשה], Transactions carries [title · ייבוא מ־CSV · תנועה חדשה] with
// no search field and no month, and Cash Flow carries [title · 30/60/90] with
// the horizon selector pinned to the far edge. The remaining frames are drawn
// as the content column alone ("המשך המסכים מוצג כעמודת התוכן בלבד"), so they
// specify no header actions and get the title by itself; their own contextual
// controls stay in the screen body where those frames put them.
//
// A month stepper only appears where a month is genuinely the screen's
// context. On Transactions — which spans whatever range its filters select —
// or on Accounts, it would claim a scope the screen does not have.
//
// Checkpoint 4 (Home + Transactions recompose): this bar shows from
// `web:desktop:` (1200px) on every route except Home and Transactions,
// which show it from `web:tabletLg:` (1024px) instead — those two screens'
// own rich components now mount starting at 1024 (see their own header
// comments), and neither draws its own title, so without this the
// 1024-1199 range would show their tabletLg composition under no title at
// all. Every other route's content still switches to its desktop component
// at 1200 unchanged, so this bar staying `web:desktop:`-scoped there is
// what prevents a title band appearing over still-mobile-styled content —
// a per-segment threshold, not a global one, is what the Checkpoint 4 brief
// means by "the smallest architectural piece necessary." The side rail and
// the bottom-tab-bar visibility are untouched (still 1200/unchanged) —
// SYSTEM.md 2 is explicit that the bottom tab bar owns all of 768-1199px,
// including this sub-range; only this title band moves earlier, for these
// two routes.

import { useState } from 'react'
import { Pressable, Text, TextInput, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Ionicons } from '@expo/vector-icons'
import { useColorScheme } from 'nativewind'
import { colors } from '@/constants/colors'
import { ICON } from '@/constants/icons'
import { useRTL } from '@/hooks/useRTL'
import { usePeriodStore } from '@/store/periodStore'
import { useCashFlowStore, type CashFlowHorizonDays } from '@/store/cashFlowStore'

import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { formatMonthLabel, shiftMonth } from '@/features/budgets/lib/budgetPeriod'

const TABLET_LG_SEGMENTS = new Set(['dashboard', 'transactions'])

// Screen title per route segment, matching the mockup's own header wording.
// Cash Flow is the one place that wording differs from its rail label: the
// rail says "תזרים", the header band says "תזרים מזומנים".
const TITLE_KEY_BY_SEGMENT: Record<string, string> = {
  dashboard: 'tabs.dashboard',
  transactions: 'tabs.transactions',
  budgets: 'tabs.budgets',
  'cash-flow': 'nav.cashFlow',
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
// The mockup shows the search field on Home only.
const SEARCH_SEGMENTS = new Set(['dashboard'])
// ...and the CSV-import link on Transactions only.
const IMPORT_SEGMENTS = new Set(['transactions'])
// The primary action appears on the two frames the mockup gives one.
const ADD_SEGMENTS = new Set(['dashboard', 'transactions'])

// Cash Flow's own header control: how far ahead the forecast runs.
const HORIZONS: { value: CashFlowHorizonDays; labelKey: string }[] = [
  { value: '30', labelKey: 'cashFlow.forecast.horizon.days30' },
  { value: '60', labelKey: 'cashFlow.forecast.horizon.days60' },
  { value: '90', labelKey: 'cashFlow.forecast.horizon.days90' },
]

export function DesktopTopBar({ activeSegment }: { activeSegment: string }) {
  const { t } = useTranslation()
  const router = useRouter()
  const { colorScheme: scheme } = useColorScheme()
  const { flip } = useRTL()
  const isDark = scheme === 'dark'
  const iconColor = isDark ? colors.inkMuted.dark : colors.inkMuted.light
  const accentColor = isDark ? colors.accent.dark : colors.accent.light
  const placeholderColor = isDark ? colors.inkMuted.dark : colors.inkMuted.light
  // A real query, not a shortcut to an empty Transactions screen: typing
  // here and submitting hands the exact same `q` route param Transactions'
  // own search field writes (features/transactions/lib/transactionFilters.ts),
  // so it lands on that screen already filtered by what was typed here,
  // using the identical live substring match against description/merchant/
  // category that field already has — this box used to just navigate to
  // Transactions untouched, which looked like search but wasn't one.
  const [searchQuery, setSearchQuery] = useState('')
  function submitSearch() {
    const trimmed = searchQuery.trim()
    router.push(trimmed ? { pathname: '/transactions', params: { q: trimmed } } : '/transactions')
  }
  const periodStart = usePeriodStore((s) => s.selectedPeriodStart)
  const setPeriodStart = usePeriodStore((s) => s.setSelectedPeriodStart)
  const horizonDays = useCashFlowStore((s) => s.horizonDays)
  const setHorizonDays = useCashFlowStore((s) => s.setHorizonDays)

  const titleKey = TITLE_KEY_BY_SEGMENT[activeSegment]
  const showMonth = MONTH_SCOPED_SEGMENTS.has(activeSegment)
  const showSearch = SEARCH_SEGMENTS.has(activeSegment)
  const showImport = IMPORT_SEGMENTS.has(activeSegment)
  const showAdd = ADD_SEGMENTS.has(activeSegment)
  const showHorizon = activeSegment === 'cash-flow'
  const visibleFromTabletLg = TABLET_LG_SEGMENTS.has(activeSegment)

  return (
    <View
      className={`hidden h-[68px] flex-none flex-row items-center gap-3.5 border-b border-border-light bg-surfaceMuted-light px-7 dark:border-border-dark dark:bg-surfaceMuted-dark ${
        visibleFromTabletLg ? 'web:tabletLg:flex' : 'web:desktop:flex'
      }`}
    >
      <Text className="font-heeboBold text-[20px] leading-[26px] text-ink-light dark:text-ink-dark">
        {titleKey ? t(titleKey) : ''}
      </Text>

      {showMonth && (
        <View className="ms-2.5 flex-row items-center gap-1.5 rounded-control bg-surface-light px-2.5 py-1.5 dark:bg-surface-dark">
          {/* Through `flip`, like MonthNavigator, so both steppers pick the
              same glyph by the same rule. @expo/vector-icons does not mirror
              its glyphs — a chevron named "forward" draws a right-pointing
              chevron in any direction — so under RTL "earlier" is the one
              pointing at the start edge, which is the RIGHT. Hardcoding
              `chevron-back` here had the arrows inverted. */}
          <Pressable
            onPress={() => setPeriodStart(shiftMonth(periodStart, -1))}
            accessibilityRole="button"
            accessibilityLabel={t('dashboard.previousMonth')}
            className="h-6 w-6 items-center justify-center"
          >
            <Ionicons name={flip('chevron-back', 'chevron-forward')} size={ICON.chip} color={iconColor} />
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
            <Ionicons name={flip('chevron-forward', 'chevron-back')} size={ICON.chip} color={iconColor} />
          </Pressable>
        </View>
      )}

      <View className="ms-auto flex-row items-center gap-2.5">
        {showHorizon && (
          <View className="w-[240px]">
            <SegmentedControl
              options={HORIZONS.map((horizon) => ({ value: horizon.value, label: t(horizon.labelKey) }))}
              value={horizonDays}
              onChange={setHorizonDays}
              accessibilityLabel={t('cashFlow.forecast.sectionTitle')}
            />
          </View>
        )}
        {showSearch && (
          <View className="w-[220px] flex-row items-center gap-2 rounded-control border border-border-light px-3 py-2.5 dark:border-border-dark">
            <Pressable onPress={submitSearch} accessibilityRole="button" accessibilityLabel={t('dashboard.searchAction')}>
              <Ionicons name="search-outline" size={ICON.row} color={iconColor} />
            </Pressable>
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              onSubmitEditing={submitSearch}
              returnKeyType="search"
              placeholder={t('dashboard.searchPlaceholder')}
              placeholderTextColor={placeholderColor}
              accessibilityLabel={t('dashboard.searchPlaceholder')}
              textAlign={flip('left', 'right')}
              className="flex-1 text-bodySm text-ink-light dark:text-ink-dark"
            />
            {searchQuery.length > 0 && (
              <Pressable
                onPress={() => setSearchQuery('')}
                accessibilityRole="button"
                accessibilityLabel={t('dashboard.searchClear')}
              >
                <Ionicons name="close-circle" size={ICON.chip} color={iconColor} />
              </Pressable>
            )}
          </View>
        )}
        {showImport && (
          // A link, not a filled button: the mockup gives CSV import accent
          // text beside the primary action, which keeps it available without
          // competing with it. CSV is an escape hatch, not the way in.
          <Pressable
            onPress={() => router.push('/transactions/import')}
            accessibilityRole="button"
            accessibilityLabel={t('import.title')}
            className="flex-row items-center gap-1.5 px-1 py-2.5"
          >
            <Ionicons name="cloud-upload-outline" size={ICON.row} color={accentColor} />
            <Text className="text-bodySm font-sansSemibold text-accent-light dark:text-accent-dark">
              {t('more.import')}
            </Text>
          </Pressable>
        )}
        {showAdd && (
          <Pressable
            onPress={() => router.push('/transactions/new')}
            accessibilityRole="button"
            accessibilityLabel={t('transactions.addButton')}
            className="flex-row items-center gap-1.5 rounded-control bg-accent-light px-4 py-2.5 dark:bg-accent-dark"
          >
            <Ionicons name="add" size={ICON.row} color={isDark ? colors.hero.light : '#ffffff'} />
            <Text
              className="text-bodySm font-sansSemibold"
              style={{ color: isDark ? colors.hero.light : '#ffffff' }}
            >
              {t('transactions.addButton')}
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  )
}
