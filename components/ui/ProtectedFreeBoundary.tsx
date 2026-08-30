// The protected/free boundary — Living Money's approved boundary instrument
// (CP8A), replacing the coarse composition bar that used to live inline in
// MobileHome.tsx (lines ~172-179/270-285) and DesktopDashboard.tsx (lines
// ~232-236). Same two figures calculateSafeToSpend already returns —
// `reservedAgorot` (protected: obligations + recurring + instalments) and
// `safeToSpendAgorot` (truly free) — this component draws them, it does not
// compute them. No new financial calculation exists here beyond turning two
// already-computed totals into a percentage of a third already-computed
// total, purely for layout.
//
// Geometry alone is not a safe way to say which side is which under RTL —
// the independent design review's own finding, and a real bug this
// component fixes: the composition bar it replaces put the FREE segment
// first (the RTL start/right edge) and the protected segments trailing
// toward the end/left — the opposite of the approved S4/Living Money
// boundary's own geometry (`inset-inline-start` protected / `inset-inline-
// end` free). So this component:
//   - pins `protected` to the RTL start edge (right) and `free` to the end
//     edge (left) with RN's own logical `start`/`end` style keys, not
//     className or DOM/flex order — the same technique
//     components/ui/BudgetBar.tsx's pace marker already relies on, because
//     those keys are genuinely mirrored by the layout engine on both
//     platforms and a flex-order assumption is not.
//   - gives `protected` a diagonal hatch texture distinct from `free`'s
//     solid fill (same "status via texture, not just color" rule
//     components/ui/BudgetBar.tsx's overrun state already follows), so
//     color is never the only signal.
//   - labels both regions with their name AND their amount underneath the
//     bar, in source order (protected, then free) so the visible text and
//     the accessible reading order agree regardless of layout direction —
//     a screen reader announces "מוגן ₪X", then "פנוי ₪Y", never just a
//     silent colored/textured box.

import { Text, View } from 'react-native'
import Svg, { Defs, Line, Pattern, Rect } from 'react-native-svg'
import { useTranslation } from 'react-i18next'
import { colors } from '@/constants/colors'
import { Money } from '@/components/ui/Money'

interface ProtectedFreeBoundaryProps {
  // Always >= 0 — the sum of every upcoming obligation/recurring/instalment
  // reservation (calculateSafeToSpend's own `reservedAgorot`).
  protectedAgorot: number
  // The remaining free amount (calculateSafeToSpend's own
  // `safeToSpendAgorot`). Callers only render this component once they've
  // already confirmed there is no shortfall — same guard the composition
  // bar it replaces used (a negative free amount has no meaningful boundary
  // to draw).
  freeAgorot: number
  // The whole pool the two figures above divide (`availableCashAgorot`).
  totalAgorot: number
  height?: number
}

export function ProtectedFreeBoundary({ protectedAgorot, freeAgorot, totalAgorot, height = 10 }: ProtectedFreeBoundaryProps) {
  const { t } = useTranslation()
  const total = Math.max(1, totalAgorot)
  const protectedPercent = Math.min(100, Math.max(0, (protectedAgorot / total) * 100))
  const freePercent = Math.max(0, 100 - protectedPercent)

  return (
    <View>
      <View
        className="w-full overflow-hidden rounded-full"
        style={{ height, backgroundColor: colors.heroBorder.light }}
        // Decorative: the label row below is the accessible description of
        // this split, so a screen reader is not also handed an unlabeled
        // colored box to interpret on its own.
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <View style={{ position: 'absolute', start: 0, top: 0, bottom: 0, width: `${protectedPercent}%` }}>
          <Svg width="100%" height={height}>
            <Defs>
              <Pattern id="protectedHatch" width={8} height={8} patternUnits="userSpaceOnUse">
                <Rect width={8} height={8} fill={colors.heroBorder.light} />
                <Line x1={0} y1={8} x2={8} y2={0} stroke={colors.heroInkMuted.light} strokeWidth={1.5} opacity={0.5} />
              </Pattern>
            </Defs>
            <Rect width="100%" height={height} fill="url(#protectedHatch)" />
          </Svg>
        </View>
        <View
          style={{
            position: 'absolute',
            end: 0,
            top: 0,
            bottom: 0,
            width: `${freePercent}%`,
            backgroundColor: colors.heroAccent.light,
          }}
        />
      </View>

      <View className="mt-1.5 flex-row items-baseline justify-between">
        <View className="flex-row items-baseline gap-1.5">
          <Text className="text-meta font-sansSemibold text-heroInkMuted-light" maxFontSizeMultiplier={1.6}>
            {t('home.hero.protectedLabel')}
          </Text>
          <Money agorot={protectedAgorot} size="caption" tone="heroMuted" />
        </View>
        <View className="flex-row items-baseline gap-1.5">
          <Text className="text-meta font-sansSemibold text-heroInkMuted-light" maxFontSizeMultiplier={1.6}>
            {t('home.hero.freeLabel')}
          </Text>
          <Money agorot={freeAgorot} size="caption" tone="hero" />
        </View>
      </View>
    </View>
  )
}
