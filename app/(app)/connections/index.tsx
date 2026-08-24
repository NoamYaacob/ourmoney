// Screens 15-16 of the mobile design — bank/card connections.
//
// A product-scope check on this exact plan (product-scope-guardian, this
// pass) found that docs/OPEN_BANKING.md gates the whole Open Banking phase
// on written confirmation from Israeli fintech counsel of the licensing
// route: "No work in this phase begins — not a spike, not a prototype, not
// an aggregator trial — until [that] has confirmed." That gate has not
// cleared. The household decision that followed: build this screen, but as
// a permanently-locked informational surface, never a working (even if
// fake) connection flow — every row stays disabled, and no row's tap ever
// simulates "connecting."
//
// Screens 17-18 (a connected-account detail screen, a disconnect/error
// state) were originally left out entirely for the same reason — nothing to
// show once connected, since nothing here ever connects. Revisited by
// explicit product decision: preview.tsx now renders them as a static,
// clearly-labeled "this is only a preview" mockup, reached solely via the
// link below — never as the result of tapping a connection type, and never
// carrying any real institution's name or any real data.
//
// No hook, no Supabase call, no new table, no network call, no dependency.
// Every string on this screen (not preview.tsx) only ever says "not yet" —
// never a step number, a progress state, or copy that could read as a
// connection in progress.

import { Pressable, Text, View } from 'react-native'
import { useState } from 'react'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Ionicons } from '@expo/vector-icons'
import { useColorScheme } from 'nativewind'
import { colors } from '@/constants/colors'
import { ICON } from '@/constants/icons'
import { Screen } from '@/components/ui/Screen'
import { ListCard, ListRow, RowIcon } from '@/components/ui/ListCard'
import { StatusChip } from '@/components/ui/StatusChip'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { Button } from '@/components/ui/Button'

const CONNECTION_TYPES = [
  { key: 'bankAccount', icon: 'business-outline' as const },
  { key: 'creditCard', icon: 'card-outline' as const },
]

export default function Connections() {
  const { t } = useTranslation()
  const router = useRouter()
  const { colorScheme: scheme } = useColorScheme()
  const iconColor = scheme === 'dark' ? colors.inkMuted.dark : colors.inkMuted.light
  const [infoVisible, setInfoVisible] = useState(false)

  return (
    <Screen onBack={() => router.back()} width="wide">
      <Text className="mb-2 text-title font-heebo text-ink-light dark:text-ink-dark web:desktop:hidden">
        {t('connections.title')}
      </Text>
      <Text className="mb-6 text-body text-inkMuted-light dark:text-inkMuted-dark">
        {t('connections.subtitle')}
      </Text>

      <View className="web:desktop:flex-row web:desktop:items-start web:desktop:gap-6">
        <View className="web:desktop:flex-1">
          <ListCard>
            {CONNECTION_TYPES.map((type) => (
              <ListRow
                key={type.key}
                title={t(`connections.types.${type.key}`)}
                subtitle={t('connections.notAvailableYet')}
                leading={
                  <RowIcon>
                    <Ionicons name={type.icon} size={ICON.row} color={iconColor} />
                  </RowIcon>
                }
                badges={<StatusChip label={t('common.comingSoon')} />}
                onPress={() => setInfoVisible(true)}
                // ListCard's own default accessibilityLabel is just `title` —
                // fine for a row that navigates, but every row on this screen
                // is a permanent dead-end (mobile-expo-reviewer finding): a
                // screen-reader user needs "not available yet" in the
                // announced name itself, not only in a separate Text node they
                // may not reach before deciding whether to tap.
                accessibilityLabel={`${t(`connections.types.${type.key}`)} — ${t('connections.notAvailableYet')}`}
              />
            ))}
          </ListCard>

          {/* Screens 17-18 of the mobile design: a static, obviously-
              fictional preview of what a connected account and its status
              messages will look like once the Open Banking gate clears —
              see preview.tsx's own header comment. A plain secondary link,
              not a peer of the locked rows above it: this never simulates
              tapping into a real connection, it says up front that it's a
              preview. */}
          <Pressable
            onPress={() => router.push('/connections/preview')}
            accessibilityRole="button"
            className="mt-4 self-start"
          >
            <Text className="text-caption font-medium text-accent-light dark:text-accent-dark">
              {t('connections.preview.entryLink')}
            </Text>
          </Pressable>
        </View>

        {/* Desktop Claude Design pass: the mockup's own "הוספת מקור פיננסי"
            side panel — bank/card connection stay the exact same permanent
            dead-end as the list beside them (dark, locked cards, same
            info-sheet tap target, same "not available yet" reality); cash/
            manual and CSV import are real, already-shipped features
            (Accounts' own "add account" flow, Transactions' own CSV
            import), so those two rows route to them for real rather than
            also being presented as locked — mislabeling a working feature
            as "coming soon" would be its own kind of wrong. Desktop-only:
            mobile's screen (Screens 15-16 of the mobile design) is
            unaffected. */}
        <View className="hidden web:desktop:flex web:desktop:w-[340px] web:desktop:flex-none web:desktop:gap-2.5">
          <Text className="text-meta font-sansSemibold tracking-[0.08em] text-inkMuted-light dark:text-inkMuted-dark">
            {t('connections.otherWays.sectionTitle')}
          </Text>
          <Text className="web:desktop:-mt-1 text-caption text-inkMuted-light dark:text-inkMuted-dark">
            {t('connections.otherWays.sectionSubtitle')}
          </Text>

          <Pressable
            onPress={() => setInfoVisible(true)}
            accessibilityRole="button"
            accessibilityLabel={`${t('connections.types.bankAccount')} — ${t('connections.notAvailableYet')}`}
            className="web:desktop:mt-2 web:desktop:flex-row web:desktop:items-center web:desktop:gap-3 web:desktop:rounded-hero web:desktop:bg-hero-light web:desktop:p-4 dark:web:desktop:bg-hero-dark"
          >
            <View className="web:desktop:h-10 web:desktop:w-10 web:desktop:items-center web:desktop:justify-center web:desktop:rounded-control web:desktop:bg-heroBorder-light">
              <Ionicons name="business-outline" size={ICON.nav} color={colors.heroAccent.light} />
            </View>
            <View className="web:desktop:flex-1">
              <View className="web:desktop:flex-row web:desktop:items-center web:desktop:gap-2">
                <Text className="text-body font-sansSemibold text-heroInk-light">{t('connections.types.bankAccount')}</Text>
                <StatusChip label={t('connections.otherWays.recommended')} tone="accent" />
              </View>
              <Text className="text-caption text-heroInkMuted-light">{t('connections.otherWays.bankSubtitle')}</Text>
            </View>
          </Pressable>

          <Pressable
            onPress={() => setInfoVisible(true)}
            accessibilityRole="button"
            accessibilityLabel={`${t('connections.types.creditCard')} — ${t('connections.notAvailableYet')}`}
            className="web:desktop:flex-row web:desktop:items-center web:desktop:gap-3 web:desktop:rounded-hero web:desktop:bg-hero-light web:desktop:p-4 dark:web:desktop:bg-hero-dark"
          >
            <View className="web:desktop:h-10 web:desktop:w-10 web:desktop:items-center web:desktop:justify-center web:desktop:rounded-control web:desktop:bg-heroBorder-light">
              <Ionicons name="card-outline" size={ICON.nav} color={colors.heroAccent.light} />
            </View>
            <View className="web:desktop:flex-1">
              <Text className="text-body font-sansSemibold text-heroInk-light">{t('connections.types.creditCard')}</Text>
              <Text className="text-caption text-heroInkMuted-light">{t('connections.otherWays.cardSubtitle')}</Text>
            </View>
          </Pressable>

          <Pressable
            onPress={() => router.push('/accounts')}
            accessibilityRole="button"
            className="web:desktop:flex-row web:desktop:items-center web:desktop:gap-3 web:desktop:rounded-hero web:desktop:border web:desktop:border-border-light web:desktop:bg-surfaceMuted-light web:desktop:p-4 dark:web:desktop:border-border-dark dark:web:desktop:bg-surfaceMuted-dark"
          >
            <View className="web:desktop:h-10 web:desktop:w-10 web:desktop:items-center web:desktop:justify-center web:desktop:rounded-control web:desktop:bg-surface-light dark:web:desktop:bg-surface-dark">
              <Ionicons name="cash-outline" size={ICON.nav} color={iconColor} />
            </View>
            <View className="web:desktop:flex-1">
              <Text className="text-body font-sansSemibold text-ink-light dark:text-ink-dark">
                {t('connections.otherWays.manualAccount')}
              </Text>
              <Text className="text-caption text-inkMuted-light dark:text-inkMuted-dark">
                {t('connections.otherWays.manualAccountSubtitle')}
              </Text>
            </View>
          </Pressable>

          <Pressable
            onPress={() => router.push('/transactions/import')}
            accessibilityRole="button"
            className="web:desktop:flex-row web:desktop:items-center web:desktop:gap-3 web:desktop:rounded-hero web:desktop:border web:desktop:border-border-light web:desktop:bg-surfaceMuted-light web:desktop:p-4 dark:web:desktop:border-border-dark dark:web:desktop:bg-surfaceMuted-dark"
          >
            <View className="web:desktop:h-10 web:desktop:w-10 web:desktop:items-center web:desktop:justify-center web:desktop:rounded-control web:desktop:bg-surface-light dark:web:desktop:bg-surface-dark">
              <Ionicons name="document-attach-outline" size={ICON.nav} color={iconColor} />
            </View>
            <View className="web:desktop:flex-1">
              <Text className="text-body font-sansSemibold text-ink-light dark:text-ink-dark">
                {t('connections.otherWays.importCsv')}
              </Text>
              <Text className="text-caption text-inkMuted-light dark:text-inkMuted-dark">
                {t('connections.otherWays.importCsvSubtitle')}
              </Text>
            </View>
          </Pressable>
        </View>
      </View>

      <BottomSheet visible={infoVisible} title={t('connections.info.title')} onClose={() => setInfoVisible(false)}>
        <Text className="mb-4 text-body text-ink-light dark:text-ink-dark">{t('connections.info.body')}</Text>
        <View className="mb-2">
          <Button title={t('connections.info.dismiss')} onPress={() => setInfoVisible(false)} />
        </View>
      </BottomSheet>
    </Screen>
  )
}
