// Screens 15-16 of the mobile design — bank/card connections.
//
// A product-scope check on this exact plan (product-scope-guardian, this
// pass) found that docs/OPEN_BANKING.md gates the whole Open Banking phase
// on written confirmation from Israeli fintech counsel of the licensing
// route: "No work in this phase begins — not a spike, not a prototype, not
// an aggregator trial — until [that] has confirmed." That gate has not
// cleared. The household decision that followed: build this screen, but as
// a permanently-locked informational surface, never a working (even if
// fake) connection flow — every row stays disabled, no row's tap ever
// simulates "connecting," and there is no "connected account" state
// anywhere in this screen or its sheet. That also means screens 17-18 (a
// connected-account detail screen, a disconnect/error state) are
// deliberately NOT built — there is nothing to show once connected, since
// nothing here ever connects.
//
// No hook, no Supabase call, no new table, no network call, no dependency.
// Every string below only ever says "not yet" — never a step number, a
// progress state, or copy that could read as a connection in progress.

import { Text, View } from 'react-native'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Ionicons } from '@expo/vector-icons'
import { useColorScheme } from 'nativewind'
import { colors } from '@/constants/colors'
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
  const { colorScheme: scheme } = useColorScheme()
  const iconColor = scheme === 'dark' ? colors.inkMuted.dark : colors.inkMuted.light
  const [infoVisible, setInfoVisible] = useState(false)

  return (
    <Screen width="wide">
      <Text className="mb-2 text-title font-bold text-ink-light dark:text-ink-dark web:desktop:text-[28px]">
        {t('connections.title')}
      </Text>
      <Text className="mb-6 text-body text-inkMuted-light dark:text-inkMuted-dark">
        {t('connections.subtitle')}
      </Text>

      <ListCard>
        {CONNECTION_TYPES.map((type) => (
          <ListRow
            key={type.key}
            title={t(`connections.types.${type.key}`)}
            subtitle={t('connections.notAvailableYet')}
            leading={
              <RowIcon>
                <Ionicons name={type.icon} size={18} color={iconColor} />
              </RowIcon>
            }
            badges={<StatusChip label={t('common.comingSoon')} />}
            onPress={() => setInfoVisible(true)}
          />
        ))}
      </ListCard>

      <BottomSheet visible={infoVisible} title={t('connections.info.title')} onClose={() => setInfoVisible(false)}>
        <Text className="mb-4 text-body text-ink-light dark:text-ink-dark">{t('connections.info.body')}</Text>
        <View className="mb-2">
          <Button title={t('connections.info.dismiss')} onPress={() => setInfoVisible(false)} />
        </View>
      </BottomSheet>
    </Screen>
  )
}
