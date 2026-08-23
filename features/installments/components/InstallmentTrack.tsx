// One pill per instalment, filled for the ones already charged.
//
// Both design files draw this instead of a percentage bar, and the reason is
// worth writing down: an instalment plan is a countable number of discrete
// payments, and "5 of 12" is a fact a household can hold in mind, while
// "42%" is one they have to convert. Twelve pills also make the SHAPE of the
// commitment visible — eighteen thin pills read as a long way to go before
// any number is read at all.
//
// Above ~24 instalments the pills stop being individually legible, so the
// track collapses to a plain proportional fill rather than rendering a row
// of hairlines. Israeli card plans are almost always 3–36.

import { View } from 'react-native'

interface InstallmentTrackProps {
  paidCount: number
  totalCount: number
  height?: number
  accessibilityLabel: string
}

const MAX_PILLS = 24

export function InstallmentTrack({ paidCount, totalCount, height = 7, accessibilityLabel }: InstallmentTrackProps) {
  const total = Math.max(1, totalCount)
  const paid = Math.min(total, Math.max(0, paidCount))

  const shared = {
    testID: 'installment-track',
    accessible: true,
    accessibilityRole: 'progressbar' as const,
    accessibilityLabel,
    accessibilityValue: { min: 0, max: total, now: paid },
  }

  if (total > MAX_PILLS) {
    return (
      <View {...shared} className="w-full overflow-hidden rounded-full bg-track-light dark:bg-track-dark" style={{ height }}>
        <View className="h-full rounded-full bg-ink-light dark:bg-ink-dark" style={{ width: `${(paid / total) * 100}%` }} />
      </View>
    )
  }

  return (
    <View {...shared} className="w-full flex-row gap-[3px]">
      {Array.from({ length: total }, (_, index) => (
        <View
          key={index}
          className={`flex-1 rounded-full ${
            index < paid ? 'bg-ink-light dark:bg-ink-dark' : 'bg-track-light dark:bg-track-dark'
          }`}
          style={{ height }}
        />
      ))}
    </View>
  )
}
