// One instalment plan, in the two shapes the design files draw.
//
// `card` is `OurMoney - Mobile.dc.html` screen 09: a card with the tile, the
// name, how many payments are left and until when, the monthly figure, and
// the pill track underneath. `row` is the desktop Credit & Payments frame:
// the same facts laid across one line — tile, name and purchase date, the
// track with its schedule sentence beside it, then the monthly and the
// remaining as two aligned figure columns.
//
// What it never does is arithmetic on money. `monthly_agorot` is the
// generator's own floor-division figure (migration 016 enforces it with a
// CHECK), and the remaining balance is the plan total minus what has already
// materialized as real transactions — the same subtraction the plan's own
// detail screen makes, not a second estimate.

import { Pressable, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { CategoryIcon } from '@/features/categories/components/CategoryIcon'
import { InstallmentTrack } from '@/features/installments/components/InstallmentTrack'
import { Money } from '@/components/ui/Money'
import { StatusChip } from '@/components/ui/StatusChip'
import { addMonthClamped } from '@/lib/engines/cashflow/forecastInstallmentOccurrences'
import { formatDateDisplay } from '@/lib/dates/format'
import type { InstallmentPlan } from '@/types/app'

export type InstallmentPlanRowVariant = 'card' | 'row'

interface InstallmentPlanRowProps {
  plan: InstallmentPlan
  /** How many of this plan's instalments already exist as transactions. */
  paidCount: number
  categoryIcon?: string | null
  /** The card the plan is charged to, when the frame names it. */
  accountName?: string
  variant?: InstallmentPlanRowVariant
}

export function InstallmentPlanRow({
  plan,
  paidCount,
  categoryIcon,
  accountName,
  variant = 'card',
}: InstallmentPlanRowProps) {
  const { t } = useTranslation()
  const router = useRouter()

  const paid = Math.min(plan.installment_count, Math.max(0, paidCount))
  const remainingCount = plan.installment_count - paid
  const remainingAgorot = plan.total_agorot - plan.monthly_agorot * paid
  // Index n falls on first_charge_date + (n - 1) months — the generator's own
  // rule, via its own function, so a date shown here can never disagree with
  // the date a transaction eventually lands on.
  const lastChargeDate = addMonthClamped(plan.first_charge_date, plan.installment_count - 1)
  const nextChargeDate = remainingCount > 0 ? addMonthClamped(plan.first_charge_date, paid) : null
  const isFinished = remainingCount === 0

  const trackLabel = t('installments.installmentProgress', {
    materialized: paid,
    total: plan.installment_count,
  })

  const scheduleLine = isFinished
    ? t('installments.finishedLine', {
        total: plan.installment_count,
        last: formatDateDisplay(lastChargeDate),
      })
    : t('installments.scheduleLine', {
        index: paid + 1,
        total: plan.installment_count,
        next: formatDateDisplay(nextChargeDate as string),
        last: formatDateDisplay(lastChargeDate),
      })

  const open = () => router.push(`/installments/${plan.id}`)

  if (variant === 'row') {
    return (
      <Pressable
        onPress={open}
        accessibilityRole="button"
        accessibilityLabel={`${plan.description}, ${trackLabel}`}
        className="flex-row items-center gap-4 border-t border-divider-light py-4 dark:border-divider-dark"
      >
        <CategoryIcon icon={categoryIcon} size="sm" />
        <View className="w-[230px]">
          <View className="flex-row items-center gap-2">
            <Text className="text-body font-sansSemibold text-ink-light dark:text-ink-dark" numberOfLines={1}>
              {plan.description}
            </Text>
            {!plan.is_shared && <StatusChip label={t('transactions.form.personal')} />}
          </View>
          <Text className="text-meta font-sans text-inkMuted-light dark:text-inkMuted-dark" numberOfLines={1}>
            {t('installments.purchasedOn', { date: formatDateDisplay(plan.first_charge_date) })}
            {accountName ? ` · ${accountName}` : ''}
          </Text>
        </View>
        <View className="flex-1">
          <InstallmentTrack paidCount={paid} totalCount={plan.installment_count} accessibilityLabel={trackLabel} />
          <Text className="mt-1.5 text-meta font-sans text-inkMuted-light dark:text-inkMuted-dark" numberOfLines={1}>
            {scheduleLine}
          </Text>
        </View>
        <View className="w-[120px] items-end">
          <Money agorot={plan.monthly_agorot} size="row" />
          <Text className="text-meta font-sans text-inkMuted-light dark:text-inkMuted-dark">
            {t('installments.perMonth')}
          </Text>
        </View>
        <View className="w-[120px] items-end">
          <Money agorot={remainingAgorot} size="row" tone="muted" />
          <Text className="text-meta font-sans text-inkMuted-light dark:text-inkMuted-dark">
            {t('installments.remainingLabel')}
          </Text>
        </View>
      </Pressable>
    )
  }

  return (
    <Pressable
      onPress={open}
      accessibilityRole="button"
      accessibilityLabel={`${plan.description}, ${trackLabel}`}
      className="rounded-card border border-border-light bg-surfaceMuted-light p-4 dark:border-border-dark dark:bg-surfaceMuted-dark"
    >
      <View className="flex-row items-center gap-3">
        <CategoryIcon icon={categoryIcon} size="sm" />
        <View className="flex-1">
          <View className="flex-row items-center gap-2">
            <Text className="text-body font-sansSemibold text-ink-light dark:text-ink-dark" numberOfLines={1}>
              {plan.description}
            </Text>
            {!plan.is_shared && <StatusChip label={t('transactions.form.personal')} />}
          </View>
          <Text className="text-meta font-sans text-inkMuted-light dark:text-inkMuted-dark" numberOfLines={1}>
            {isFinished
              ? scheduleLine
              : t('installments.remainingCount', {
                  count: remainingCount,
                  date: formatDateDisplay(lastChargeDate),
                })}
          </Text>
        </View>
        <View className="items-end">
          <Money agorot={plan.monthly_agorot} size="row" />
          <Text className="text-meta font-sans text-inkMuted-light dark:text-inkMuted-dark">
            {t('installments.perMonth')}
          </Text>
        </View>
      </View>
      <View className="mt-3">
        <InstallmentTrack
          paidCount={paid}
          totalCount={plan.installment_count}
          height={6}
          accessibilityLabel={trackLabel}
        />
      </View>
    </Pressable>
  )
}
