import { useState } from 'react'
import { Text, View } from 'react-native'
import { Link } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useSignUp } from '@/features/auth/hooks/useSignUp'
import { mapAuthError } from '@/features/auth/lib/mapAuthError'
import { Screen } from '@/components/ui/Screen'
import { AuthHeader } from '@/components/ui/AuthHeader'
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

  // Release-readiness pass: sign-in and forgot-password both disable their
  // submit button until every field has something in it — this screen had
  // no such gate at all, so its button looked identical whether the form
  // was empty or complete. Matches that same "non-empty" bar (not full
  // validation — validate() below still owns the real rules and per-field
  // messages on submit) so the same conceptual action looks and behaves
  // the same across all three auth screens.
  const isValid =
    displayName.trim().length > 0 && email.trim().length > 0 && password.length > 0 && confirmPassword.length > 0

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
        <AuthHeader title={t('auth.signUp.successTitle')} />
        <Text className="-mt-4 text-center text-body font-sans text-inkMuted-light dark:text-inkMuted-dark">
          {t('auth.signUp.successBody')}
        </Text>
      </Screen>
    )
  }

  return (
    <Screen center keyboardAvoiding>
      <AuthHeader title={t('auth.signUp.title')} />

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

      <Button title={t('auth.signUp.submit')} onPress={handleSubmit} disabled={!isValid} loading={signUp.isPending} />

      <View className="mt-6 flex-row justify-center gap-1">
        <Text className="text-caption font-sans text-inkMuted-light dark:text-inkMuted-dark">{t('auth.signUp.signInPrompt')}</Text>
        <Link href="/sign-in" className="text-caption font-sansSemibold text-accent-light dark:text-accent-dark">
          {t('auth.signUp.signInLink')}
        </Link>
      </View>
    </Screen>
  )
}
