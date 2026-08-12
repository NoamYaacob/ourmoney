// Composes N Skeleton "row" shapes for a section still loading list-shaped
// content (recent transactions, budget progress, accounts, goals, recurring
// templates, category rules, ...) — reused across every screen with this
// exact shape rather than duplicating the accessible-loading wrapper at
// each call site. Skeleton itself is decorative/hidden; this wrapper is the
// one element a screen reader actually announces (matches LoadingSpinner's
// existing progressbar/label/live-region convention).

import { View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Skeleton } from './Skeleton'

interface SkeletonListProps {
  rows?: number
  rowClassName?: string
}

export function SkeletonList({ rows = 3, rowClassName = 'h-12 w-full rounded-xl' }: SkeletonListProps) {
  const { t } = useTranslation()

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={t('common.loading')}
      accessibilityLiveRegion="polite"
      className="gap-3"
    >
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} testID="skeleton-row" className={rowClassName} />
      ))}
    </View>
  )
}
