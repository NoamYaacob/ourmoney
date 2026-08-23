// One alert, in the two shapes the design files draw it.
//
// `card` is `OurMoney - Mobile.dc.html` screen 13: a rounded card whose
// hairline is tinted by tier, icon at the start, title, body, and the action
// underneath. `stripe` is the desktop Alerts frame: the same content on a
// card that is flat on its start edge and carries a 3px tier-coloured bar
// there instead, with the action as an accent link.
//
// Both had been approximations. The phone put every alert of a tier inside
// one shared card separated by dividers, which loses the per-alert border
// the design uses to say what KIND of thing each one is; the desktop card
// drew its stripe with `border-e`, so the bar sat on the end edge while the
// icon sat on the start, and the design's own `border-inline-start` put them
// together.
//
// It renders whatever `buildFinancialAlerts` produced and never decides what
// is worth alerting about — including the tier, which comes from
// alertDisplay.ts's own mapping rather than from anything read here.

import { Pressable, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Ionicons } from '@expo/vector-icons'
import { useColorScheme } from 'nativewind'
import { ICON } from '@/constants/icons'
import { alertTier, tierColor, tierIconName, TIER_BORDER_CLASS } from '@/features/alerts/lib/alertDisplay'
import type { FinancialAlert } from '@/types/app'

export type AlertCardVariant = 'card' | 'stripe'

interface AlertCardProps {
  alert: FinancialAlert
  variant?: AlertCardVariant
}

export function AlertCard({ alert, variant = 'card' }: AlertCardProps) {
  const { t } = useTranslation()
  const router = useRouter()
  const { colorScheme: scheme } = useColorScheme()
  const isDark = scheme === 'dark'
  const tier = alertTier(alert)
  const isStripe = variant === 'stripe'

  return (
    <Pressable
      onPress={() => router.push(alert.actionRoute)}
      accessibilityRole="button"
      accessibilityLabel={`${alert.title}. ${alert.description}`}
      className={
        isStripe
          ? // Flat on the start edge, where the tier bar is: the bar reads as
            // part of the card's own edge rather than a stroke inside it.
            `flex-row gap-3 rounded-e-card border border-s-[3px] bg-surfaceMuted-light p-4 dark:bg-surfaceMuted-dark ${TIER_BORDER_CLASS[tier]}`
          : `flex-row gap-2.5 rounded-card border bg-surfaceMuted-light p-4 dark:bg-surfaceMuted-dark ${TIER_BORDER_CLASS[tier]}`
      }
      style={isStripe ? { borderStartColor: tierColor(tier, isDark ? 'dark' : 'light') } : undefined}
    >
      <Ionicons
        name={tierIconName(tier)}
        size={ICON.nav}
        color={tierColor(tier, isDark ? 'dark' : 'light')}
        style={{ marginTop: 1 }}
      />
      <View className="flex-1">
        <Text className="text-body font-sansSemibold text-ink-light dark:text-ink-dark">{alert.title}</Text>
        <Text className="mt-0.5 text-caption font-sans text-inkMuted-light dark:text-inkMuted-dark">
          {alert.description}
        </Text>
        {/* The way out, named. An alert that states a problem and offers no
            route to it is a notification; the design gives every one of
            these a destination, and it is the same route the whole card
            already navigates to — spelled out so it is visible, not just
            discoverable by tapping. */}
        <Text className="mt-2 text-caption font-sansSemibold text-accent-light dark:text-accent-dark">
          {t('alerts.openAction')}
        </Text>
      </View>
    </Pressable>
  )
}
