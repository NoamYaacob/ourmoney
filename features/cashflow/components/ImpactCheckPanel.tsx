// CP8F — Single Purchase Impact Check: "אפשר להרשות לעצמנו את זה?"
//
// A deliberately-invoked secondary action living on the Safe-to-Spend
// detail screen (never the Home hero — this checkpoint's own brief,
// section 6). Collapsed by default; opens into one amount field and a
// live, purely-derived comparison. No submit/save step and no persistence
// anywhere in this component — `useImpactCheck`'s own `calculate` is a
// pure function of whatever is currently typed, called fresh on every
// render, never cached or written anywhere (section 2/7).
//
// Living Money grammar, not a calculator card: CURRENT STATE → hypothetical
// expense → CHANGED FUTURE STATE, reusing this app's own established
// pieces — Money's typography/tone convention, the moneyJourney before/
// after vocabulary, and the same danger-surface tokens
// MobileCashFlow.tsx's own shortfall banner already uses (SurfacePanel/
// InsetGroup are desktop/tablet-only styled — see their own headers — so
// this mobile-first panel builds its neutral/danger card treatment from
// the same raw tokens those hand-built banners already use, not through
// that desktop-scoped abstraction).
//
// No red/green celebration: SAFE gets the plain ink tone Money already
// reserves for a healthy figure with no fanfare; only the genuinely
// negative post-purchase low point gets `tone="danger"` — sign and
// language still carry the meaning, exactly like this checkpoint's own
// section 13 instruction (semantic reinforcement is allowed for the
// negative case, but never neon, never automatic red for anything less
// than actually negative).

import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Ionicons } from '@expo/vector-icons'
import { useColorScheme } from 'nativewind'
import { colors } from '@/constants/colors'
import { ICON } from '@/constants/icons'
import { agorotFromILS, formatILS } from '@/lib/money/format'
import { formatDateDisplay } from '@/lib/dates/format'
import { Money } from '@/components/ui/Money'
import { ListCard, ListRow } from '@/components/ui/ListCard'
import { AmountField } from '@/features/transactions/components/AmountField'
import { useImpactCheck } from '@/features/cashflow/hooks/useImpactCheck'

interface ImpactCheckPanelProps {
  householdId: string | null | undefined
}

export function ImpactCheckPanel({ householdId }: ImpactCheckPanelProps) {
  const { t } = useTranslation()
  const { colorScheme: scheme } = useColorScheme()
  const isDark = scheme === 'dark'
  const { hasData, calculate } = useImpactCheck(householdId)
  const [expanded, setExpanded] = useState(false)
  const [amountText, setAmountText] = useState('')

  const trimmed = amountText.trim()
  const parsed = trimmed === '' ? null : agorotFromILS(trimmed)
  const impact = parsed?.ok && parsed.agorot !== null ? calculate(parsed.agorot) : null

  function handleClear() {
    setAmountText('')
  }

  function handleClose() {
    setExpanded(false)
    setAmountText('')
  }

  if (!hasData) return null

  if (!expanded) {
    return (
      <ListCard className="mt-3 web:desktop:shadow-sm">
        <ListRow
          title={t('impactCheck.entryLabel')}
          subtitle={t('impactCheck.entrySubtitle')}
          leading={
            <View className="h-9 w-9 items-center justify-center rounded-row bg-surface-light dark:bg-surface-dark">
              <Ionicons name="calculator-outline" size={ICON.row} color={isDark ? colors.ink.dark : colors.ink.light} />
            </View>
          }
          onPress={() => setExpanded(true)}
          accessibilityLabel={t('impactCheck.entryLabel')}
        />
      </ListCard>
    )
  }

  return (
    <View
      accessibilityRole="summary"
      accessibilityLabel={t('impactCheck.sectionLabel')}
      className="mt-3 rounded-card border border-border-light bg-surfaceMuted-light p-4 web:desktop:p-5 web:desktop:shadow-sm dark:border-border-dark dark:bg-surfaceMuted-dark"
    >
      <View className="mb-3 flex-row items-center justify-between">
        <Text className="text-body font-sansSemibold text-ink-light dark:text-ink-dark">{t('impactCheck.entryLabel')}</Text>
        <Pressable onPress={handleClose} accessibilityRole="button" accessibilityLabel={t('impactCheck.close')} className="h-9 w-9 items-center justify-center">
          <Ionicons name="close" size={ICON.row} color={isDark ? colors.inkMuted.dark : colors.inkMuted.light} />
        </Pressable>
      </View>

      <AmountField
        label={t('impactCheck.amountLabel')}
        value={amountText}
        onChangeText={setAmountText}
        placeholder={t('impactCheck.amountPlaceholder')}
      />

      {parsed && !parsed.ok && (
        <Text className="mb-3 text-center text-caption text-danger-light dark:text-danger-dark" accessibilityRole="alert">
          {t(`transactions.form.errors.amount.${parsed.error ?? 'invalid'}`)}
        </Text>
      )}

      {impact && (
        <View accessibilityLiveRegion="polite">
          <View className="gap-2">
            <View className="flex-row items-center justify-between">
              <Text className="text-caption font-sans text-inkMuted-light dark:text-inkMuted-dark">{t('impactCheck.currentLabel')}</Text>
              <Money agorot={impact.currentSafeToSpendAgorot} size="large" />
            </View>
            <View className="flex-row items-center justify-between">
              <Text className="text-caption font-sans text-inkMuted-light dark:text-inkMuted-dark">{t('impactCheck.postPurchaseLabel')}</Text>
              <Money
                agorot={impact.postPurchaseSafeToSpendAgorot}
                size="large"
                tone={impact.postPurchaseSafeToSpendAgorot < 0 ? 'danger' : 'default'}
              />
            </View>
          </View>

          <View className="my-3 h-px bg-divider-light dark:bg-divider-dark" />

          <Text className="mb-1.5 text-caption font-sansSemibold text-ink-light dark:text-ink-dark">{t('impactCheck.lowPointLabel')}</Text>
          <View className="flex-row items-center gap-3">
            <View className="flex-1">
              <Text className="text-meta font-sans text-inkMuted-light dark:text-inkMuted-dark">{t('moneyJourney.before')}</Text>
              <Money agorot={impact.currentLowPointAgorot} size="row" />
              <Text className="text-meta font-sans text-inkMuted-light dark:text-inkMuted-dark">{formatDateDisplay(impact.currentLowPointDate)}</Text>
            </View>
            <View className="flex-1">
              <Text className="text-meta font-sans text-inkMuted-light dark:text-inkMuted-dark">{t('moneyJourney.after')}</Text>
              <Money agorot={impact.postPurchaseLowPointAgorot} size="row" tone={impact.crossesBelowZero ? 'danger' : 'default'} />
              <Text className="text-meta font-sans text-inkMuted-light dark:text-inkMuted-dark">{formatDateDisplay(impact.postPurchaseLowPointDate)}</Text>
            </View>
          </View>

          <View
            className={`mt-3 rounded-row border p-3.5 ${
              impact.verdict === 'UNSAFE'
                ? 'border-dangerBorder-light bg-dangerSurface-light dark:border-dangerBorder-dark dark:bg-dangerSurface-dark'
                : 'border-border-light bg-surface-light dark:border-border-dark dark:bg-surface-dark'
            }`}
          >
            <Text className="text-body font-sansSemibold text-ink-light dark:text-ink-dark">
              {t(impact.verdict === 'UNSAFE' ? 'impactCheck.verdict.unsafeTitle' : 'impactCheck.verdict.safeTitle')}
            </Text>
            <Text className="mt-1 text-caption font-sans text-inkMuted-light dark:text-inkMuted-dark">
              {impact.verdict === 'UNSAFE'
                ? t('impactCheck.verdict.unsafeBody', {
                    amount: formatILS(impact.postPurchaseLowPointAgorot),
                    date: t('impactCheck.lowPointDate', { date: formatDateDisplay(impact.postPurchaseLowPointDate) }),
                  })
                : t('impactCheck.verdict.safeBody', { amount: formatILS(impact.postPurchaseLowPointAgorot) })}
            </Text>
          </View>
        </View>
      )}

      <Text className="mt-3 text-meta font-sans text-inkMuted-light dark:text-inkMuted-dark">{t('impactCheck.assumption')}</Text>

      {trimmed !== '' && (
        <Pressable onPress={handleClear} accessibilityRole="button" accessibilityLabel={t('impactCheck.clear')} className="mt-3 self-start">
          <Text className="text-caption font-sansSemibold text-accent-light dark:text-accent-dark">{t('impactCheck.clear')}</Text>
        </Pressable>
      )}
    </View>
  )
}
