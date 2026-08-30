// Screen 02 of the mobile design — what "פנוי באמת" is made of.
//
// Opened by tapping the Home hero. Its whole job is trust: the household
// sees one number on the front door, and this screen has to show that the
// number is arithmetic rather than an opinion. So it reads top-down as the
// sum it actually is — money that exists, minus each committed group, equals
// the figure — and every group opens to the individual charges inside it.
//
// It computes nothing. `calculateSafeToSpend` already returns each
// component and an itemised `items` array; this screen groups those items by
// `sourceType` and renders them. If a figure here ever disagreed with the
// hero, that would mean two calculations existed, which is exactly what
// routing everything through the one engine prevents.
//
// The instalments row is the one place this screen shows something the
// design file's three-row breakdown does not. The engine reserves
// not-yet-charged instalments as a fourth component (ADR-037), and a
// household that can see three subtractions but is handed a total reflecting
// four would be right to distrust the screen. It renders only when there is
// something in it.

import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Ionicons } from '@expo/vector-icons'
import { useColorScheme } from 'nativewind'
import { colors } from '@/constants/colors'
import { ICON } from '@/constants/icons'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { useHousehold } from '@/features/household/hooks/useHousehold'
import { useSafeToSpend } from '@/features/cashflow/hooks/useSafeToSpend'
import type { SafeToSpendItem, SafeToSpendItemSource } from '@/lib/engines/cashflow/calculateSafeToSpend'
import { formatDateDisplay } from '@/lib/dates/format'
import { Screen } from '@/components/ui/Screen'
import { Money } from '@/components/ui/Money'
import { HeroPanel, HeroLabel, HeroNote } from '@/components/ui/HeroPanel'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { ErrorMessage } from '@/components/ui/ErrorMessage'

interface BreakdownGroup {
  source: SafeToSpendItemSource
  labelKey: string
  subtitleKey: string
  amountAgorot: number
  items: SafeToSpendItem[]
}

export default function SafeToSpendDetail() {
  const { t } = useTranslation()
  const router = useRouter()
  const { colorScheme: scheme } = useColorScheme()
  const isDark = scheme === 'dark'
  const { user } = useAuth()
  const { householdId, isLoading: isHouseholdLoading } = useHousehold(user?.id)
  const { result, isLoading, error, hasData, refetch } = useSafeToSpend(householdId, 'month')
  const [openGroup, setOpenGroup] = useState<SafeToSpendItemSource | null>('obligation')

  if (isHouseholdLoading || isLoading) {
    return (
      <Screen onBack={() => router.back()} center>
        <LoadingSpinner />
      </Screen>
    )
  }

  // Only a genuine "never loaded" failure replaces the whole screen.
  // `hasData` is false exactly then — a later background refetch failing
  // after a previous success leaves `hasData` true and `result` holding
  // real, last-known-good figures, which the non-blocking banner below
  // surfaces instead of discarding them (see useSafeToSpend.ts's `hasData`
  // field for the full reasoning).
  if (!hasData) {
    return (
      <Screen onBack={() => router.back()}>
        <ErrorMessage message={t('cashFlow.errors.generic')} onRetry={refetch} />
      </Screen>
    )
  }

  const hasShortfall = result.safeToSpendAgorot < 0
  const itemsBySource = (source: SafeToSpendItemSource) => result.items.filter((item) => item.sourceType === source)

  const allGroups: BreakdownGroup[] = [
    {
      source: 'obligation',
      labelKey: 'safeToSpendDetail.obligations',
      subtitleKey: 'safeToSpendDetail.obligationsSubtitle',
      amountAgorot: result.plannedObligationsAgorot,
      items: itemsBySource('obligation'),
    },
    {
      source: 'recurring',
      labelKey: 'safeToSpendDetail.recurring',
      subtitleKey: 'safeToSpendDetail.recurringSubtitle',
      amountAgorot: result.recurringAgorot,
      items: itemsBySource('recurring'),
    },
    {
      source: 'installment',
      labelKey: 'safeToSpendDetail.installments',
      subtitleKey: 'safeToSpendDetail.installmentsSubtitle',
      amountAgorot: result.installmentsAgorot,
      items: itemsBySource('installment'),
    },
  ]
  // A group with nothing in it is not a zero to render — it is a line the
  // household does not have. Dropping it keeps the arithmetic honest (every
  // visible minus row has something behind it) and keeps the screen short
  // for a household with no instalments.
  const groups = allGroups.filter((group) => group.amountAgorot > 0)

  return (
    // Checkpoint 7: this was the one screen a tap off the fully desktop-
    // composed Home hero with no distinct tablet/desktop treatment at
    // all — `wide` (1150px at desktop) also read as a needlessly wide
    // frame around a single column of rows; `richSingle` matches what
    // Cash Flow (its closest, already-approved sibling: hero + evidence
    // list, no second data category) already settled on.
    <Screen onBack={() => router.back()} scroll width="richSingle">
      {error && (
        <View className="mb-3">
          <ErrorMessage message={t('cashFlow.errors.generic')} onRetry={refetch} />
        </View>
      )}
      {/* The edge-bleed only cancelled Screen's mobile/tablet padding
          (px-6/pt-6) — at web:desktop: Screen's own padding grows to
          px-8/pt-9, so without a matching web:desktop: pair here the hero
          under-cancelled by 8px horizontally / 12px vertically at that
          width. Same class of bug SYSTEM.md's own §1 already names once
          (the Cash Flow banner-merge incident) — fixed the same way. */}
      <View className="-mx-6 -mt-6 web:desktop:-mx-8 web:desktop:-mt-9">
        <HeroPanel className="rounded-none rounded-b-hero px-6 pb-6 pt-3 web:desktop:px-8 web:desktop:pb-8 web:desktop:pt-4">
          <View className="h-11 flex-row items-center justify-between">
            <Pressable
              onPress={() => router.back()}
              accessibilityRole="button"
              accessibilityLabel={t('common.cancel')}
              className="-ms-2.5 h-11 w-11 items-center justify-center"
            >
              {/* chevron-forward under RTL points back toward the start edge
                  — the same pairing the desktop pass had to correct. */}
              <Ionicons name="chevron-forward" size={ICON.hero} color={colors.heroInk.light} />
            </Pressable>
            <Text className="text-body font-sansSemibold text-heroInk-light">{t('safeToSpendDetail.title')}</Text>
            <View className="w-11" />
          </View>

          <View className="mt-2">
            <HeroLabel>{t('home.hero.label', { horizon: t('cashFlow.horizon.month') })}</HeroLabel>
          </View>
          <View className="mt-1">
            <Money
              agorot={hasShortfall ? result.shortfallAgorot : result.safeToSpendAgorot}
              size="hero"
              tone="hero"
            />
          </View>
          <HeroNote className="mt-1">{t('safeToSpendDetail.intro')}</HeroNote>
        </HeroPanel>
      </View>

      <View className="mt-4 overflow-hidden rounded-card border border-border-light bg-surfaceMuted-light dark:border-border-dark dark:bg-surfaceMuted-dark web:desktop:shadow-sm">
        {/* Money that exists. No chevron: there is nothing underneath it to
            open — the account-by-account view is its own screen. */}
        <View className="min-h-[56px] flex-row items-center gap-3 px-4 py-3.5 web:desktop:px-5 web:desktop:py-4">
          <View className="h-9 w-9 items-center justify-center rounded-row bg-surface-light dark:bg-surface-dark">
            <Ionicons name="wallet-outline" size={ICON.row} color={isDark ? colors.ink.dark : colors.ink.light} />
          </View>
          <View className="flex-1">
            <Text className="text-body font-sansSemibold text-ink-light dark:text-ink-dark">
              {t('safeToSpendDetail.availableCash')}
            </Text>
            <Text className="text-meta font-sans text-inkMuted-light dark:text-inkMuted-dark">
              {t('safeToSpendDetail.availableCashSubtitle')}
            </Text>
          </View>
          <Money agorot={result.availableCashAgorot} size="large" />
        </View>

        {groups.map((group) => {
          const isOpen = openGroup === group.source
          return (
            <View key={group.source}>
              <View className="h-px bg-divider-light dark:bg-divider-dark" />
              <Pressable
                onPress={() => setOpenGroup(isOpen ? null : group.source)}
                accessibilityRole="button"
                accessibilityState={{ expanded: isOpen }}
                accessibilityLabel={t(group.labelKey)}
                className="min-h-[56px] flex-row items-center gap-3 px-4 py-3.5 web:desktop:px-5 web:desktop:py-4 web:hover:bg-surface-light/60 dark:web:hover:bg-surface-dark/40"
              >
                {/* The minus is the operator in the sum, so it sits where
                    every other row puts its icon — the column reads as
                    arithmetic down the page. */}
                <View className="h-9 w-9 items-center justify-center rounded-row bg-surface-light dark:bg-surface-dark">
                  <Text
                    className="font-heeboBold text-title text-inkMuted-light dark:text-inkMuted-dark"
                    maxFontSizeMultiplier={1.2}
                  >
                    −
                  </Text>
                </View>
                <View className="flex-1">
                  <Text className="text-body font-sansSemibold text-ink-light dark:text-ink-dark">
                    {t(group.labelKey)}
                  </Text>
                  <Text className="text-meta font-sans text-inkMuted-light dark:text-inkMuted-dark">
                    {t(group.subtitleKey, { count: group.items.length })}
                  </Text>
                </View>
                <Money agorot={group.amountAgorot} size="large" />
                <Ionicons
                  name={isOpen ? 'chevron-up' : 'chevron-down'}
                  size={ICON.row}
                  color={isDark ? colors.inkMuted.dark : colors.inkMuted.light}
                />
              </Pressable>

              {isOpen && (
                <View className="pb-3 ps-[68px] pe-4">
                  {group.items.length === 0 ? (
                    <Text className="py-1.5 text-caption font-sans text-inkMuted-light dark:text-inkMuted-dark">
                      {t('safeToSpendDetail.empty')}
                    </Text>
                  ) : (
                    group.items.map((item) => (
                      <View
                        key={`${item.sourceType}-${item.sourceId}-${item.date}`}
                        className="flex-row items-center justify-between gap-3 py-1.5"
                      >
                        <Text
                          className="flex-1 text-caption font-sans text-inkMuted-light dark:text-inkMuted-dark"
                          numberOfLines={1}
                        >
                          {item.description} · {formatDateDisplay(item.date)}
                        </Text>
                        <Money agorot={item.amountAgorot} size="caption" tone="muted" />
                      </View>
                    ))
                  )}
                </View>
              )}
            </View>
          )
        })}
      </View>

      {/* The equals row, on the dark panel — the same surface the figure
          arrived on, so the sum visibly closes back onto the hero. */}
      <HeroPanel className="mt-3 p-4 web:desktop:p-5">
        <View className="flex-row items-center gap-3">
          <Text className="font-heebo text-heading text-heroAccent-light">=</Text>
          <Text className="flex-1 text-body font-sansSemibold text-heroInk-light">
            {hasShortfall ? t('safeToSpendDetail.shortfallResult') : t('safeToSpendDetail.result')}
          </Text>
          <Money
            agorot={hasShortfall ? result.shortfallAgorot : result.safeToSpendAgorot}
            size="large"
            tone="hero"
          />
        </View>
      </HeroPanel>

      {/* What the number deliberately leaves out. A household that knows it
          has ₪40,000 in a savings account and reads "₪1,384 פנוי" needs this
          sentence, or the screen looks wrong rather than careful. */}
      <View className="mt-3 rounded-card border border-border-light bg-surfaceMuted-light p-4 dark:border-border-dark dark:bg-surfaceMuted-dark web:desktop:p-5 web:desktop:shadow-sm">
        <Text className="text-caption font-sans text-inkMuted-light dark:text-inkMuted-dark">
          <Text className="font-sansBold text-ink-light dark:text-ink-dark">
            {t('safeToSpendDetail.excludedTitle')}
          </Text>{' '}
          {t('safeToSpendDetail.excludedBody')}
        </Text>
      </View>

      <View className="h-4" />
    </Screen>
  )
}
