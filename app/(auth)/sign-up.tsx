import { useState } from 'react'
import { Text, View } from 'react-native'
import { Link } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useSignUp } from '@/features/auth/hooks/useSignUp'
import { mapAuthError } from '@/features/auth/lib/mapAuthError'
import { Screen } from '@/components/ui/Screen'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { ErrorMessage } from '@/components/ui/ErrorMessage'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MIN_PASSWORD_LENGTH = 8

interface FieldErrors {
  displayName?: string
  email?: string
  password?: string
  confirmPassword?: string
}

export default function SignUp() {
  const { t } = useTranslation()
  const signUp = useSignUp()

  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [errors, setErrors] = useState<FieldErrors>({})

  function validate(): FieldErrors {
    const next: FieldErrors = {}
    if (displayName.trim().length === 0) next.displayName = t('auth.validation.displayNameRequired')
    if (email.trim().length === 0) next.email = t('auth.validation.emailRequired')
    else if (!EMAIL_PATTERN.test(email.trim())) next.email = t('auth.validation.emailInvalid')
    if (password.length < MIN_PASSWORD_LENGTH) next.password = t('auth.validation.passwordTooShort')
    if (confirmPassword !== password) next.confirmPassword = t('auth.validation.passwordMismatch')
    return next
  }

  function handleSubmit() {
    if (signUp.isPending) return
    const nextErrors = validate()
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return
    signUp.mutate({ email: email.trim(), password, displayName: displayName.trim() })
  }

  if (signUp.isSuccess) {
    return (
      <Screen center>
        <Text className="mb-2 text-center text-2xl font-bold text-ink-light dark:text-ink-dark">
          {t('auth.signUp.successTitle')}
        </Text>
        <Text className="text-center text-base text-inkMuted-light dark:text-inkMuted-dark">
          {t('auth.signUp.successBody')}
        </Text>
      </Screen>
    )
  }

  return (
    <Screen center keyboardAvoiding>
      <Text className="mb-8 text-center text-2xl font-bold text-ink-light dark:text-ink-dark">
        {t('auth.signUp.title')}
      </Text>

      <Input
        label={t('auth.signUp.displayNameLabel')}
        value={displayName}
        onChangeText={setDisplayName}
        placeholder={t('auth.signUp.displayNamePlaceholder')}
        autoComplete="name"
        textContentType="name"
        error={errors.displayName}
      />

      <Input
        label={t('auth.signUp.emailLabel')}
        value={email}
        onChangeText={setEmail}
        placeholder={t('auth.signUp.emailPlaceholder')}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
        error={errors.email}
      />

      <Input
        label={t('auth.signUp.passwordLabel')}
        value={password}
        onChangeText={setPassword}
        placeholder={t('auth.signUp.passwordPlaceholder')}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        error={errors.password}
      />

      <Input
        label={t('auth.signUp.confirmPasswordLabel')}
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        placeholder={t('auth.signUp.confirmPasswordPlaceholder')}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        error={errors.confirmPassword}
      />

      {signUp.isError && <ErrorMessage message={t(mapAuthError('signUp', signUp.error))} />}

      <Button title={t('auth.signUp.submit')} onPress={handleSubmit} loading={signUp.isPending} />

      <View className="mt-6 flex-row justify-center gap-1">
        <Text className="text-sm text-inkMuted-light dark:text-inkMuted-dark">{t('auth.signUp.signInPrompt')}</Text>
        <Link href="/sign-in" className="text-sm font-semibold text-accent-light dark:text-accent-dark">
          {t('auth.signUp.signInLink')}
        </Link>
      </View>
    </Screen>
  )
}
