import { useState } from 'react'
import { Text } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useRouter } from 'expo-router'
import { useCreateHousehold } from '@/features/household/hooks/useCreateHousehold'
import { mapCreateHouseholdError } from '@/features/household/lib/mapHouseholdError'
import { Screen } from '@/components/ui/Screen'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { ErrorMessage } from '@/components/ui/ErrorMessage'

export default function CreateHousehold() {
  const { t } = useTranslation()
  const router = useRouter()
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
    <Screen center keyboardAvoiding>
      <Text className="mb-8 text-center text-2xl font-bold text-ink-light dark:text-ink-dark">
        {t('onboarding.createHousehold.title')}
      </Text>

      <Input
        label={t('onboarding.createHousehold.nameLabel')}
        value={name}
        onChangeText={setName}
        placeholder={t('onboarding.createHousehold.namePlaceholder')}
      />

      {resolvedError && <ErrorMessage message={t(mapCreateHouseholdError(resolvedError))} />}
      {createHousehold.isError && <ErrorMessage message={t('household.errors.bug')} />}

      <Button
        title={t('onboarding.createHousehold.submit')}
        onPress={handleSubmit}
        disabled={!isValid}
        loading={createHousehold.isPending}
      />
    </Screen>
  )
}
