import { useState } from 'react'
import { Text } from 'react-native'
import { Link } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useForgotPassword } from '@/features/auth/hooks/useForgotPassword'
import { mapAuthError } from '@/features/auth/lib/mapAuthError'
import { Screen } from '@/components/ui/Screen'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { ErrorMessage } from '@/components/ui/ErrorMessage'

export default function ForgotPassword() {
  const { t } = useTranslation()
  const forgotPassword = useForgotPassword()

  const [email, setEmail] = useState('')
  const isValid = email.trim().length > 0

  function handleSubmit() {
    if (!isValid || forgotPassword.isPending) return
    forgotPassword.mutate(email.trim())
  }

  if (forgotPassword.isSuccess) {
    return (
      <Screen center>
        <Text className="mb-2 text-center text-2xl font-bold text-ink-light dark:text-ink-dark">
          {t('auth.forgotPassword.successTitle')}
        </Text>
        <Text className="mb-6 text-center text-base text-inkMuted-light dark:text-inkMuted-dark">
          {t('auth.forgotPassword.successBody')}
        </Text>
        <Link href="/sign-in" className="text-sm font-semibold text-accent-light dark:text-accent-dark">
          {t('auth.forgotPassword.backToSignIn')}
        </Link>
      </Screen>
    )
  }

  return (
    <Screen center keyboardAvoiding>
      <Text className="mb-8 text-center text-2xl font-bold text-ink-light dark:text-ink-dark">
        {t('auth.forgotPassword.title')}
      </Text>

      <Input
        label={t('auth.forgotPassword.emailLabel')}
        value={email}
        onChangeText={setEmail}
        placeholder={t('auth.forgotPassword.emailPlaceholder')}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
      />

      {forgotPassword.isError && <ErrorMessage message={t(mapAuthError('forgotPassword', forgotPassword.error))} />}

      <Button
        title={t('auth.forgotPassword.submit')}
        onPress={handleSubmit}
        disabled={!isValid}
        loading={forgotPassword.isPending}
      />

      <Link
        href="/sign-in"
        className="mt-6 text-center text-sm font-semibold text-accent-light dark:text-accent-dark"
      >
        {t('auth.forgotPassword.backToSignIn')}
      </Link>
    </Screen>
  )
}
