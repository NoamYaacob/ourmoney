// CP8B's own isolated production review route for the Money Journey
// component — real hooks, real Supabase-shaped data, real i18n, exactly
// like every other screen in this app. Not a prototype and not a mockup.
//
// Deliberately NOT linked into primary navigation yet (`href: null` in
// app/(app)/_layout.tsx, the same pattern every other detail/utility screen
// already uses — see that file's own registration list). This checkpoint's
// job is to production-test the component in isolation, not to decide
// where it lives in the product: replacing Home's own composition
// (Direction D) with something that includes Money Journey is CP8C's
// explicit, separate decision, per the migration plan's own sequencing.
// Reachable directly at /money-journey for review.
//
// Same 30-day horizon and 'month' Safe-to-Spend window Home's own
// FinancialTimelineChart/List already use for the identical relationship
// (see MobileHome.tsx's CASH_FLOW_TIMELINE_HORIZON_DAYS and its
// useSafeToSpend(..., 'month') call) — so the "resulting balance matches
// Safe-to-Spend" marker this screen can show is the same truthful
// relationship Home's own timeline already establishes, not a new one
// invented for this review route.

import { Platform, View, useWindowDimensions } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { useHousehold } from '@/features/household/hooks/useHousehold'
import { useCashFlowForecast } from '@/features/cashflow/hooks/useCashFlowForecast'
import { useSafeToSpend } from '@/features/cashflow/hooks/useSafeToSpend'
import { MoneyJourney, type MoneyJourneyVariant } from '@/features/cashflow/components/MoneyJourney'
import { TABLET_LG_BREAKPOINT_PX, DESKTOP_BREAKPOINT_PX } from '@/constants/layout'
import { Screen } from '@/components/ui/Screen'
import { HeroPanel, HeroLabel, HeroNote } from '@/components/ui/HeroPanel'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { SkeletonList } from '@/components/ui/SkeletonList'

const CASH_FLOW_TIMELINE_HORIZON_DAYS = 30

function useMoneyJourneyVariant(): MoneyJourneyVariant {
  const { width } = useWindowDimensions()
  if (Platform.OS !== 'web' || width < TABLET_LG_BREAKPOINT_PX) return 'mobile'
  if (width < DESKTOP_BREAKPOINT_PX) return 'tabletLg'
  return 'desktop'
}

export default function MoneyJourneyReview() {
  const { t } = useTranslation()
  const router = useRouter()
  const { user } = useAuth()
  const { householdId, isLoading: isHouseholdLoading } = useHousehold(user?.id)
  const variant = useMoneyJourneyVariant()

  const {
    result: forecast,
    isLoading: isForecastLoading,
    error: forecastError,
    hasData: hasForecastData,
    refetch: refetchForecast,
  } = useCashFlowForecast(householdId, CASH_FLOW_TIMELINE_HORIZON_DAYS)
  const { result: safeToSpend, isLoading: isSafeToSpendLoading, hasData: hasSafeToSpendData } = useSafeToSpend(householdId, 'month')

  if (isHouseholdLoading) {
    return (
      <Screen onBack={() => router.back()} center>
        <LoadingSpinner />
      </Screen>
    )
  }

  return (
    <Screen onBack={() => router.back()} scroll width="wide">
      <HeroPanel>
        <HeroLabel>{t('moneyJourney.title')}</HeroLabel>
        <HeroNote className="mt-1.5">{t('moneyJourney.subtitle')}</HeroNote>

        <View className="mt-4">
          {isForecastLoading || isSafeToSpendLoading ? (
            <SkeletonList rows={3} />
          ) : !hasForecastData ? (
            <ErrorMessage message={t('cashFlow.errors.generic')} onRetry={refetchForecast} />
          ) : (
            <MoneyJourney
              forecast={forecast}
              safeToSpendAgorot={hasSafeToSpendData ? safeToSpend.safeToSpendAgorot : null}
              variant={variant}
            />
          )}
        </View>
      </HeroPanel>

      {forecastError && (
        <View className="mt-3">
          <ErrorMessage message={t('cashFlow.errors.generic')} onRetry={refetchForecast} />
        </View>
      )}
    </Screen>
  )
}
