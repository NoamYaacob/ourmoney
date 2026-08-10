// Deep-link landing target for ourmoney://reset-password (see
// features/auth/hooks/useForgotPassword.ts and useRecoverySession.ts). Not
// part of the (auth) group — features/auth/lib/authRedirect.ts treats
// 'reset-password' as a pass-through regardless of session state, so the
// guard never fights a user who is here because Supabase just established a
// recovery session for them. Not in docs/PHASE_1_PLAN.md's literal
// Milestone 3 file list; added this session so forgot-password is usable
// end-to-end instead of pointing at a route that doesn't exist.

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
  View,
} from 'react-native'
import { Link } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { colors } from '@/constants/colors'
import { useRecoverySession } from '@/features/auth/hooks/useRecoverySession'
import { useResetPassword } from '@/features/auth/hooks/useResetPassword'
import { mapAuthError } from '@/features/auth/lib/mapAuthError'

const MIN_PASSWORD_LENGTH = 8

interface FieldErrors {
  password?: string
  confirmPassword?: string
}

export default function ResetPassword() {
  const { t } = useTranslation()
  const scheme = useColorScheme()
  const placeholderColor = scheme === 'dark' ? colors.inkMuted.dark : colors.inkMuted.light
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
      <View className="flex-1 items-center justify-center bg-surface-light dark:bg-surface-dark">
        <ActivityIndicator />
      </View>
    )
  }

  if (recoveryStatus === 'error') {
    return (
      <View className="flex-1 items-center justify-center bg-surface-light px-6 dark:bg-surface-dark">
        <Text className="mb-2 text-center text-2xl font-bold text-ink-light dark:text-ink-dark">
          {t('auth.resetPassword.invalidLinkTitle')}
        </Text>
        <Text className="mb-6 text-center text-base text-inkMuted-light dark:text-inkMuted-dark">
          {t('auth.resetPassword.invalidLinkBody')}
        </Text>
        <Link
          href="/forgot-password"
          className="text-sm font-semibold text-accent-light dark:text-accent-dark"
        >
          {t('auth.resetPassword.requestNewLink')}
        </Link>
      </View>
    )
  }

  if (resetPassword.isSuccess) {
    return (
      <View className="flex-1 items-center justify-center bg-surface-light px-6 dark:bg-surface-dark">
        <Text className="mb-2 text-center text-2xl font-bold text-ink-light dark:text-ink-dark">
          {t('auth.resetPassword.successTitle')}
        </Text>
        <Text className="mb-6 text-center text-base text-inkMuted-light dark:text-inkMuted-dark">
          {t('auth.resetPassword.successBody')}
        </Text>
        <Link href="/sign-in" className="text-sm font-semibold text-accent-light dark:text-accent-dark">
          {t('auth.forgotPassword.backToSignIn')}
        </Link>
      </View>
    )
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="flex-1 bg-surface-light dark:bg-surface-dark"
    >
      <ScrollView contentContainerClassName="grow justify-center px-6" keyboardShouldPersistTaps="handled">
        <Text className="mb-8 text-center text-2xl font-bold text-ink-light dark:text-ink-dark">
          {t('auth.resetPassword.title')}
        </Text>

        <Text className="mb-1 text-sm text-inkMuted-light dark:text-inkMuted-dark">
          {t('auth.resetPassword.newPasswordLabel')}
        </Text>
        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder={t('auth.resetPassword.newPasswordPlaceholder')}
          placeholderTextColor={placeholderColor}
          secureTextEntry
          autoComplete="new-password"
          textContentType="newPassword"
          className="mb-1 rounded-xl border border-border-light bg-surfaceMuted-light px-4 py-3 text-ink-light dark:border-border-dark dark:bg-surfaceMuted-dark dark:text-ink-dark"
        />
        {errors.password && (
          <Text className="mb-3 text-sm text-red-600 dark:text-red-400">{errors.password}</Text>
        )}

        <Text className="mb-1 text-sm text-inkMuted-light dark:text-inkMuted-dark">
          {t('auth.resetPassword.confirmPasswordLabel')}
        </Text>
        <TextInput
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          placeholder={t('auth.resetPassword.confirmPasswordPlaceholder')}
          placeholderTextColor={placeholderColor}
          secureTextEntry
          autoComplete="new-password"
          textContentType="newPassword"
          className="mb-2 rounded-xl border border-border-light bg-surfaceMuted-light px-4 py-3 text-ink-light dark:border-border-dark dark:bg-surfaceMuted-dark dark:text-ink-dark"
        />
        {errors.confirmPassword && (
          <Text className="mb-4 text-sm text-red-600 dark:text-red-400">{errors.confirmPassword}</Text>
        )}

        {resetPassword.isError && (
          <Text className="mb-4 text-center text-sm text-red-600 dark:text-red-400">
            {t(mapAuthError('resetPassword', resetPassword.error))}
          </Text>
        )}

        <Pressable
          onPress={handleSubmit}
          disabled={resetPassword.isPending}
          className="items-center rounded-xl bg-slate-900 px-4 py-3 active:opacity-70 disabled:opacity-40 dark:bg-slate-100"
        >
          {resetPassword.isPending ? (
            <ActivityIndicator color={scheme === 'dark' ? colors.surface.dark : colors.surface.light} />
          ) : (
            <Text className="font-semibold text-white dark:text-slate-900">
              {t('auth.resetPassword.submit')}
            </Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}
