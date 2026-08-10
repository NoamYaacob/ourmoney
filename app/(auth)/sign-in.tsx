import { useState } from 'react'
import { Text, View } from 'react-native'
import { Link } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useSignIn } from '@/features/auth/hooks/useSignIn'
import { mapAuthError } from '@/features/auth/lib/mapAuthError'
import { Screen } from '@/components/ui/Screen'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { ErrorMessage } from '@/components/ui/ErrorMessage'

export default function SignIn() {
  const { t } = useTranslation()
  const signIn = useSignIn()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const isValid = email.trim().length > 0 && password.length > 0

  function handleSubmit() {
    if (!isValid || signIn.isPending) return
    signIn.mutate({ email: email.trim(), password })
  }

  return (
    <Screen center keyboardAvoiding>
      <Text className="mb-8 text-center text-2xl font-bold text-ink-light dark:text-ink-dark">
        {t('auth.signIn.title')}
      </Text>

      <Input
        label={t('auth.signIn.emailLabel')}
        value={email}
        onChangeText={setEmail}
        placeholder={t('auth.signIn.emailPlaceholder')}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
      />

      <Input
        label={t('auth.signIn.passwordLabel')}
        value={password}
        onChangeText={setPassword}
        placeholder={t('auth.signIn.passwordPlaceholder')}
        secureTextEntry
        autoComplete="current-password"
        textContentType="password"
      />

      <Link href="/forgot-password" className="mb-6 text-end text-sm text-accent-light dark:text-accent-dark">
        {t('auth.signIn.forgotPasswordLink')}
      </Link>

      {signIn.isError && <ErrorMessage message={t(mapAuthError('signIn', signIn.error))} />}

      <Button
        title={t('auth.signIn.submit')}
        onPress={handleSubmit}
        disabled={!isValid}
        loading={signIn.isPending}
      />

      <View className="mt-6 flex-row justify-center gap-1">
        <Text className="text-sm text-inkMuted-light dark:text-inkMuted-dark">{t('auth.signIn.signUpPrompt')}</Text>
        <Link href="/sign-up" className="text-sm font-semibold text-accent-light dark:text-accent-dark">
          {t('auth.signIn.signUpLink')}
        </Link>
      </View>
    </Screen>
  )
}
