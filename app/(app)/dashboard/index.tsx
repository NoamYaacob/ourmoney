import { useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { colorScheme } from 'nativewind'
import { useRTL } from '../../../hooks/useRTL'

// Milestone 1 proof screen — routing, Hebrew, RTL, NativeWind, and dark/light
// theme architecture. Financial content (budgets, transactions) starts in
// MVP-2. Native on-device RTL confirmation is deferred per ADR-030.
export default function Dashboard() {
  const { t } = useTranslation()
  const { isRTL } = useRTL()
  const [dark, setDark] = useState(false)

  function toggleTheme() {
    const next = !dark
    setDark(next)
    colorScheme.set(next ? 'dark' : 'light')
  }

  return (
    <View className="flex-1 bg-surface-light dark:bg-surface-dark">
      <ScrollView contentContainerClassName="pt-20 pb-10 ps-4 pe-4">
        <Text className="text-2xl font-bold text-ink-light dark:text-ink-dark">
          {t('dashboard.title')}
        </Text>
        <Text className="mt-1 text-sm text-inkMuted-light dark:text-inkMuted-dark">
          {`isRTL=${isRTL}`}
        </Text>

        <Pressable
          onPress={toggleTheme}
          className="mt-6 rounded-xl bg-slate-900 px-4 py-3 active:opacity-70 dark:bg-slate-100"
        >
          <Text className="text-center font-semibold text-white dark:text-slate-900">
            {dark ? t('theme.light') : t('theme.dark')}
          </Text>
        </Pressable>

        <View className="mt-4 rounded-xl border border-border-light bg-surfaceMuted-light p-3 dark:border-border-dark dark:bg-surfaceMuted-dark">
          <Text className="text-xs text-ink-light dark:text-ink-dark">
            {t('common.comingSoon')}
          </Text>
        </View>
      </ScrollView>
    </View>
  )
}
