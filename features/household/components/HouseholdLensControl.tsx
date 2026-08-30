// CP8D — the one shared Household Lens control (שלנו | שלי | שלך). A
// single implementation Home and Transactions both mount, backed by the
// one shared Zustand store (store/householdLensStore.ts) — never a
// per-screen filter re-implemented three times.
//
// Renders nothing when the lens has no real second option to offer — a
// single-member household, or a household query still resolving members —
// per this checkpoint's own "prefer hiding a meaningless control over
// showing שלנו | שלי | שלך when 'yours' does not exist" instruction. This
// is why every caller can mount this unconditionally rather than each
// re-deriving its own "should I show this" check.
import { Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { useHouseholdMembers } from '@/features/household/hooks/useHouseholdMembers'
import { buildLensOptions, type HouseholdLens } from '@/features/household/lib/householdLens'
import { useHouseholdLensStore } from '@/store/householdLensStore'
import { SegmentedControl, type SegmentedOption } from '@/components/ui/SegmentedControl'

const LABEL_KEY: Record<HouseholdLens, string> = {
  shared: 'household.lens.shared',
  me: 'household.lens.me',
  partner: 'household.lens.partner',
}

export function HouseholdLensControl({ householdId }: { householdId: string | null }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { members } = useHouseholdMembers(householdId)
  const lens = useHouseholdLensStore((s) => s.lens)
  const setLens = useHouseholdLensStore((s) => s.setLens)

  const options = buildLensOptions(members, user?.id)
  if (options.length <= 1) return null

  const segmentOptions: SegmentedOption<HouseholdLens>[] = options.map((option) => ({
    value: option.lens,
    label: t(LABEL_KEY[option.lens]),
    testID: `household-lens-${option.lens}`,
  }))

  // The real name(s) behind the currently-selected שלי/שלך option — quiet,
  // real attribution (never a hardcoded name) without printing it on every
  // segment. Omitted for שלנו, which names no one.
  const selectedNames = options.find((o) => o.lens === lens)?.memberNames

  return (
    <View className="gap-1.5">
      <SegmentedControl options={segmentOptions} value={lens} onChange={setLens} accessibilityLabel={t('household.lens.controlLabel')} />
      {selectedNames && selectedNames.length > 0 && (
        <Text className="text-meta font-sans text-inkMuted-light dark:text-inkMuted-dark">{selectedNames.join(', ')}</Text>
      )}
    </View>
  )
}
