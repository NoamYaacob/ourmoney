// Screens 17-18 of the mobile design — a connected-account detail view and
// a disconnect/error state — reached only from a clearly-labeled link on
// the Connections screen, never from tapping a connection type there (that
// still only ever opens the locked info sheet — see connections/index.tsx's
// own header comment for why).
//
// docs/OPEN_BANKING.md's licensing-counsel gate has not cleared, so nothing
// here is real: every name, balance, and status below is a fixed, obviously
// fictional example ("בנק לדוגמה" — "Example Bank" — never a real
// institution's name), and the screen carries a permanent, undismissable
// banner saying so. No hook, no Supabase call, no navigation target, no
// button that does anything except exist as a picture of a future state —
// consistent with the exact same discipline the locked Connections screen
// already applies.

import { Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Ionicons } from '@expo/vector-icons'
import { useColorScheme } from 'nativewind'
import { colors } from '@/constants/colors'
import { ICON } from '@/constants/icons'
import { Screen } from '@/components/ui/Screen'
import { SectionLabel } from '@/components/ui/SectionLabel'
import { ListCard, ListRow, RowIcon } from '@/components/ui/ListCard'
import { StatusChip } from '@/components/ui/StatusChip'

export default function ConnectionsPreview() {
  const { t } = useTranslation()
  const { colorScheme: scheme } = useColorScheme()
  const iconColor = scheme === 'dark' ? colors.inkMuted.dark : colors.inkMuted.light

  return (
    <Screen>
      <Text className="mb-4 text-title font-bold text-ink-light dark:text-ink-dark">{t('connections.preview.title')}</Text>

      {/* The one thing every element on this screen must never let the
          reader forget. */}
      <View className="mb-6 flex-row items-start gap-3 rounded-card border border-dangerBorder-light bg-dangerSurface-light p-4 dark:border-dangerBorder-dark dark:bg-dangerSurface-dark">
        <Ionicons
          name="alert-circle"
          size={ICON.nav}
          color={scheme === 'dark' ? colors.danger.dark : colors.danger.light}
        />
        <View className="flex-1">
          <Text className="text-body font-sansSemibold text-dangerStrong-light dark:text-dangerStrong-dark">
            {t('connections.preview.bannerTitle')}
          </Text>
          <Text className="mt-1 text-caption text-dangerStrong-light dark:text-dangerStrong-dark">
            {t('connections.preview.bannerBody')}
          </Text>
        </View>
      </View>

      <SectionLabel className="mb-2">{t('connections.preview.connectedSectionTitle')}</SectionLabel>
      <ListCard>
        <ListRow
          title={t('connections.preview.exampleBankName')}
          subtitle={`${t('connections.preview.exampleAccountSubtitle')} · ${t('connections.preview.exampleUpdatedNote')}`}
          leading={
            <RowIcon>
              <Ionicons name="business-outline" size={ICON.row} color={iconColor} />
            </RowIcon>
          }
          badges={<StatusChip label={t('connections.preview.connectedBadge')} tone="positive" dot />}
          // No onPress — a static picture, not a tappable row.
          accessibilityLabel={`${t('connections.preview.exampleBankName')} — ${t('connections.preview.connectedBadge')}`}
        />
      </ListCard>

      <SectionLabel className="mb-2 mt-6">{t('connections.preview.statesSectionTitle')}</SectionLabel>
      <View className="gap-3">
        <View className="flex-row items-start gap-3 rounded-card border border-border-light bg-surfaceMuted-light p-4 dark:border-border-dark dark:bg-surfaceMuted-dark">
          <Ionicons name="checkmark-circle" size={ICON.nav} color={scheme === 'dark' ? colors.positive.dark : colors.positive.light} />
          <View className="flex-1">
            <Text className="text-body font-sansSemibold text-ink-light dark:text-ink-dark">
              {t('connections.preview.states.successTitle')}
            </Text>
            <Text className="mt-0.5 text-caption text-inkMuted-light dark:text-inkMuted-dark">
              {t('connections.preview.states.successBody')}
            </Text>
          </View>
        </View>

        <View className="flex-row items-start gap-3 rounded-card border border-border-light bg-surfaceMuted-light p-4 dark:border-border-dark dark:bg-surfaceMuted-dark">
          <Ionicons name="close-circle" size={ICON.nav} color={scheme === 'dark' ? colors.danger.dark : colors.danger.light} />
          <View className="flex-1">
            <Text className="text-body font-sansSemibold text-ink-light dark:text-ink-dark">
              {t('connections.preview.states.failedTitle')}
            </Text>
            <Text className="mt-0.5 text-caption text-inkMuted-light dark:text-inkMuted-dark">
              {t('connections.preview.states.failedBody')}
            </Text>
          </View>
        </View>

        <View className="flex-row items-start gap-3 rounded-card border border-border-light bg-surfaceMuted-light p-4 dark:border-border-dark dark:bg-surfaceMuted-dark">
          <Ionicons name="time-outline" size={ICON.nav} color={scheme === 'dark' ? colors.warning.dark : colors.warning.light} />
          <View className="flex-1">
            <Text className="text-body font-sansSemibold text-ink-light dark:text-ink-dark">
              {t('connections.preview.states.expiredTitle')}
            </Text>
            <Text className="mt-0.5 text-caption text-inkMuted-light dark:text-inkMuted-dark">
              {t('connections.preview.states.expiredBody')}
            </Text>
          </View>
        </View>
      </View>
    </Screen>
  )
}
