// Home's "מה דורש תשומת לב" — the approved Direction D Attention
// composition: one column on a phone, 2-/3-up from tabletLg (1024) and a
// clean 3-up at desktop (1200+). Renders `useFinancialAlerts` unmodified —
// the same severity-sorted list `/alerts` shows in full — through the same
// 4-tier severity system (`alertTier`/`tierIconName`/`tierColor`/
// `TIER_BORDER_CLASS`/`TIER_LABEL_CLASS`, features/alerts/lib/alertDisplay.ts)
// the real `/alerts` screen already uses, so a card can never read
// differently here than it does there.
//
// Each card's action button navigates to the alert's own real
// `actionRoute` — the same, already-correct destination the previous
// Home alert cards used. (The design-review artifact's own prototype
// showed some cards scrolling to an in-page timeline point instead; that
// was a prototype convenience with no real screen behind it. Production
// uses the real destination, which is the more correct behavior, not a
// visual regression — the card's composition, dot, title, why-text and
// button are unchanged.)

import { Pressable, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useColorScheme } from 'nativewind'
import { Ionicons } from '@expo/vector-icons'
import { alertTier, tierIconName, tierColor, TIER_BORDER_CLASS, TIER_LABEL_CLASS } from '@/features/alerts/lib/alertDisplay'
import { ICON } from '@/constants/icons'
import type { FinancialAlert, FinancialAlertType } from '@/types/app'

// Real per-type action-button copy, one per alert type, each naming the
// exact screen `actionRoute` already sends the household to — not a
// generic "פתחו ←" for every card, matching the approved artifact's
// per-card, specific action labels.
const ACTION_LABEL_KEY: Record<FinancialAlertType, string> = {
  forecast_shortfall: 'home.attention.action.cashFlow',
  upcoming_obligation: 'home.attention.action.obligation',
  recurring_price_increase: 'home.attention.action.recurring',
  budget_risk: 'home.attention.action.budget',
  high_credit_card_cycle_spend: 'home.attention.action.account',
  category_spend_above_typical: 'home.attention.action.budget',
  savings_goal_behind: 'home.attention.action.goal',
  excess_cash_available: 'home.attention.action.goal',
  low_balance_warning: 'home.attention.action.cashFlow',
}

// The approved artifact's own composition is exactly 3 cards at tabletLg/
// desktop — capped here, not left to whatever the caller passes, so this
// component can never silently squeeze a 5th real alert into a sliver
// column. The full list is always still one tap away at `/alerts`.
const MAX_CARDS = 3

export function AttentionSection({ alerts: allAlerts }: { alerts: FinancialAlert[] }) {
  const { t } = useTranslation()
  const router = useRouter()
  const { colorScheme: scheme } = useColorScheme()
  const isDark = scheme === 'dark'
  const alerts = allAlerts.slice(0, MAX_CARDS)

  if (alerts.length === 0) {
    return (
      <View className="flex-row items-start gap-3 px-4 py-4">
        <View className="h-7 w-7 items-center justify-center rounded-row bg-positiveTint-light dark:bg-positiveTint-dark">
          <Ionicons name="checkmark" size={ICON.chip} color={isDark ? '#c7f0dc' : '#1f5c43'} />
        </View>
        <View className="flex-1">
          <Text className="text-body font-sansSemibold text-ink-light dark:text-ink-dark">
            {t('home.attention.empty')}
          </Text>
          <Text className="mt-0.5 text-caption font-sans text-inkMuted-light dark:text-inkMuted-dark">
            {t('home.attention.emptyHint')}
          </Text>
        </View>
      </View>
    )
  }

  // 3-up from tabletLg matches the approved artifact's own column count at
  // both 1024 and 1440 — a household reading order that never reflows
  // between the two, only the card padding/border treatment differs
  // (a divider between columns instead of a border between stacked rows).
  const columns = alerts.length >= 3

  return (
    <View className={columns ? 'web:tabletLg:flex-row' : ''}>
      {alerts.map((alert, index) => {
        const tier = alertTier(alert)
        return (
          <View
            key={alert.id}
            className={
              columns
                ? `flex-1 gap-2 border-t border-divider-light p-4 dark:border-divider-dark web:tabletLg:border-t-0 web:tabletLg:border-e ${
                    index === alerts.length - 1 ? 'web:tabletLg:border-e-0' : ''
                  } web:tabletLg:border-divider-light dark:web:tabletLg:border-divider-dark ${index === 0 ? 'border-t-0' : ''}`
                : `gap-2 p-4 ${index > 0 ? 'border-t border-divider-light dark:border-divider-dark' : ''}`
            }
          >
            <View className={`h-7 w-7 items-center justify-center rounded-row ${TIER_BORDER_CLASS[tier]} border`}>
              <Ionicons name={tierIconName(tier)} size={ICON.chip} color={tierColor(tier, isDark ? 'dark' : 'light')} />
            </View>
            <View>
              <Text className="text-body font-sansSemibold text-ink-light dark:text-ink-dark">{alert.title}</Text>
              <Text className="mt-0.5 text-caption font-sans text-inkMuted-light dark:text-inkMuted-dark">
                {alert.description}
              </Text>
            </View>
            <Pressable
              onPress={() => router.push(alert.actionRoute as never)}
              accessibilityRole="button"
              className="mt-1 self-start rounded-full border border-border-light bg-surface-light px-3 py-1.5 dark:border-border-dark dark:bg-surface-dark"
            >
              <Text className={`text-meta font-sansSemibold ${TIER_LABEL_CLASS[tier]}`}>
                {t(ACTION_LABEL_KEY[alert.type])}
              </Text>
            </Pressable>
          </View>
        )
      })}
    </View>
  )
}
