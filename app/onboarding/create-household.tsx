import { useState } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  useColorScheme,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import { useRouter } from 'expo-router'
import { colors } from '@/constants/colors'
import { useCreateHousehold } from '@/features/household/hooks/useCreateHousehold'
import { mapCreateHouseholdError } from '@/features/household/lib/mapHouseholdError'

export default function CreateHousehold() {
  const { t } = useTranslation()
  const router = useRouter()
  const scheme = useColorScheme()
  const placeholderColor = scheme === 'dark' ? colors.inkMuted.dark : colors.inkMuted.light
  const createHousehold = useCreateHousehold()

  const [name, setName] = useState('')
  const isValid = name.trim().length > 0

  // create_household's expected failures (invalid_name, already_in_household)
  // are RESOLVED values, not thrown mutation errors — see useCreateHousehold.ts.
  const resolvedError =
    createHousehold.data && !createHousehold.data.ok ? createHousehold.data.error : null

  function handleSubmit() {
    if (!isValid || createHousehold.isPending) return
    createHousehold.mutate(name.trim(), {
      onSuccess: (result) => {
        if (result.ok) router.replace('/onboarding/invite-partner')
      },
    })
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="flex-1 bg-surface-light dark:bg-surface-dark"
    >
      <ScrollView contentContainerClassName="grow justify-center px-6" keyboardShouldPersistTaps="handled">
        <Text className="mb-8 text-center text-2xl font-bold text-ink-light dark:text-ink-dark">
          {t('onboarding.createHousehold.title')}
        </Text>

        <Text className="mb-1 text-sm text-inkMuted-light dark:text-inkMuted-dark">
          {t('onboarding.createHousehold.nameLabel')}
        </Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder={t('onboarding.createHousehold.namePlaceholder')}
          placeholderTextColor={placeholderColor}
          className="mb-2 rounded-xl border border-border-light bg-surfaceMuted-light px-4 py-3 text-ink-light dark:border-border-dark dark:bg-surfaceMuted-dark dark:text-ink-dark"
        />

        {resolvedError && (
          <Text className="mb-4 text-center text-sm text-red-600 dark:text-red-400">
            {t(mapCreateHouseholdError(resolvedError))}
          </Text>
        )}
        {createHousehold.isError && (
          <Text className="mb-4 text-center text-sm text-red-600 dark:text-red-400">
            {t('household.errors.bug')}
          </Text>
        )}

        <Pressable
          onPress={handleSubmit}
          disabled={!isValid || createHousehold.isPending}
          className="items-center rounded-xl bg-slate-900 px-4 py-3 active:opacity-70 disabled:opacity-40 dark:bg-slate-100"
        >
          {createHousehold.isPending ? (
            <ActivityIndicator color={scheme === 'dark' ? colors.surface.dark : colors.surface.light} />
          ) : (
            <Text className="font-semibold text-white dark:text-slate-900">
              {t('onboarding.createHousehold.submit')}
            </Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}
