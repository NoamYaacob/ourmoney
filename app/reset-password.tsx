// Deep-link landing target for ourmoney://reset-password (see
// features/auth/hooks/useForgotPassword.ts and useRecoverySession.ts). Not
// part of the (auth) group — features/auth/lib/authRedirect.ts treats
// 'reset-password' as a pass-through regardless of session state, so the
// guard never fights a user who is here because Supabase just established a
// recovery session for them. Not in docs/PHASE_1_PLAN.md's literal
// Milestone 3 file list; added this session so forgot-password is usable
// end-to-end instead of pointing at a route that doesn't exist.

import { useState } from 'react'
import { Text } from 'react-native'
import { Link } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useRecoverySession } from '@/features/auth/hooks/useRecoverySession'
import { useResetPassword } from '@/features/auth/hooks/useResetPassword'
import { mapAuthError } from '@/features/auth/lib/mapAuthError'
import { Screen } from '@/components/ui/Screen'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'

const MIN_PASSWORD_LENGTH = 8

interface FieldErrors {
  password?: string
  confirmPassword?: string
}

export default function ResetPassword() {
  const { t } = useTranslation()
  const recoveryStatus = useRecoverySession()
  const resetPassword = useResetPassword()

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [errors, setErrors] = useState<FieldErrors>({})

  function validate(): FieldErrors {
    const next: FieldErrors = {}
    if (password.length < MIN_PASSWORD_LENGTH) next.password = t('auth.validation.passwordTooShort')
    if (confirmPassword !== password) next.confirmPassword = t('auth.validation.passwordMismatch')
    return next
  }

  function handleSubmit() {
    if (resetPassword.isPending) return
    const nextErrors = validate()
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return
    resetPassword.mutate(password)
  }

  if (recoveryStatus === 'loading') {
    return (
      <Screen center>
        <LoadingSpinner />
      </Screen>
    )
  }

  if (recoveryStatus === 'error') {
    return (
      <Screen center>
        <Text className="mb-2 text-center text-2xl font-bold text-ink-light dark:text-ink-dark">
          {t('auth.resetPassword.invalidLinkTitle')}
        </Text>
        <Text className="mb-6 text-center text-base text-inkMuted-light dark:text-inkMuted-dark">
          {t('auth.resetPassword.invalidLinkBody')}
        </Text>
        <Link href="/forgot-password" className="text-sm font-semibold text-accent-light dark:text-accent-dark">
          {t('auth.resetPassword.requestNewLink')}
        </Link>
      </Screen>
    )
  }

  if (resetPassword.isSuccess) {
    return (
      <Screen center>
        <Text className="mb-2 text-center text-2xl font-bold text-ink-light dark:text-ink-dark">
          {t('auth.resetPassword.successTitle')}
        </Text>
        <Text className="mb-6 text-center text-base text-inkMuted-light dark:text-inkMuted-dark">
          {t('auth.resetPassword.successBody')}
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
        {t('auth.resetPassword.title')}
      </Text>

      <Input
        label={t('auth.resetPassword.newPasswordLabel')}
        value={password}
        onChangeText={setPassword}
        placeholder={t('auth.resetPassword.newPasswordPlaceholder')}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        error={errors.password}
      />

      <Input
        label={t('auth.resetPassword.confirmPasswordLabel')}
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        placeholder={t('auth.resetPassword.confirmPasswordPlaceholder')}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        error={errors.confirmPassword}
      />

      {resetPassword.isError && <ErrorMessage message={t(mapAuthError('resetPassword', resetPassword.error))} />}

      <Button title={t('auth.resetPassword.submit')} onPress={handleSubmit} loading={resetPassword.isPending} />
    </Screen>
  )
}
