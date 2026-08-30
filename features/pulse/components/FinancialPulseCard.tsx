// CP8E — Financial Pulse's ONLY UI surface: a compact narrative bridge
// between the hero (NOW/WHY) and the Money Journey (WHAT WILL HAPPEN)
// inside the SAME HeroPanel — never a sixth disconnected card. Self-guards
// on `pulse === null` so every caller (Mobile Home, Desktop Dashboard) can
// mount it unconditionally, matching HouseholdLensControl/
// MoneyJourneyLowBadge's own "renders nothing when there's nothing
// meaningful to show" convention.
//
// Deliberately restrained, per this checkpoint's own explicit product
// contract:
//   - A negative delta is never rendered in a danger/red color — sign,
//     language and weight carry the meaning, exactly like every other
//     signed figure already inside this same dark hero panel (the
//     shortfall tag, the boundary). This panel already has its own
//     established tone; Financial Pulse does not invent a second one.
//   - A positive delta gets the SAME visual weight as a negative one — no
//     celebratory color, no icon, no larger type. "More available" is not
//     an achievement to congratulate; it is the same kind of fact as
//     "less available."
//   - Secondary items are visually quieter than the primary line (smaller,
//     more muted) — never competing with it.

import { Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { formatILS } from '@/lib/money/format'
import { HeroNote } from '@/components/ui/HeroPanel'
import type { FinancialPulseResult } from '@/lib/engines/pulse/computeFinancialPulse'

interface FinancialPulseCardProps {
  pulse: FinancialPulseResult | null
  // Mobile's own hairline-separator spacing by default (matches the Money
  // Journey section's identical `mt-2 border-t ... pt-2` immediately below
  // it). DesktopDashboard overrides this with its own `web:tabletLg:`-
  // prefixed rhythm — same component, each screen's own established
  // vertical spacing, never a hardcoded one-size treatment.
  className?: string
}

export function FinancialPulseCard({ pulse, className = 'mt-2 border-t border-white/[0.07] pt-2' }: FinancialPulseCardProps) {
  const { t } = useTranslation()
  if (pulse === null) return null

  const isDecrease = pulse.safeToSpendDeltaAgorot < 0
  const magnitude = formatILS(Math.abs(pulse.safeToSpendDeltaAgorot))
  const headline = pulse.safeToSpendDeltaAgorot === 0 ? null : t(isDecrease ? 'home.pulse.less' : 'home.pulse.more', { amount: magnitude })

  return (
    <View className={className} accessibilityRole="summary" accessibilityLabel={t('home.pulse.sectionLabel')}>
      {headline && (
        <>
          <Text className="text-body font-heeboBold text-heroInk-light" maxFontSizeMultiplier={1.6}>
            {headline}
          </Text>
          <HeroNote className="mt-0.5">{t('home.pulse.sinceLastTime')}</HeroNote>
        </>
      )}

      {pulse.cause?.kind === 'transaction' && (
        <HeroNote className={headline ? 'mt-1.5' : ''}>
          {t('home.pulse.causeTransaction', { description: pulse.cause.description, amount: formatILS(Math.abs(pulse.cause.amountAgorot)) })}
        </HeroNote>
      )}
      {pulse.cause?.kind === 'generic' && <HeroNote className={headline ? 'mt-1.5' : ''}>{t('home.pulse.causeGeneric')}</HeroNote>}

      {pulse.secondaryItems.length > 0 && (
        <View className={headline || pulse.cause ? 'mt-1.5 gap-0.5' : 'gap-0.5'}>
          {pulse.secondaryItems.map((item, index) => (
            <Text key={index} className="text-meta font-sans text-heroInkMuted-light" maxFontSizeMultiplier={1.6}>
              {t('home.pulse.secondaryPriceIncrease', { description: item.description, amount: formatILS(item.increaseAgorot) })}
            </Text>
          ))}
        </View>
      )}
    </View>
  )
}
