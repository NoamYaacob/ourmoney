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
import { useForgotPassword } from '@/features/auth/hooks/useForgotPassword'
import { mapAuthError } from '@/features/auth/lib/mapAuthError'

export default function ForgotPassword() {
  const { t } = useTranslation()
  const scheme = useColorScheme()
  const placeholderColor = scheme === 'dark' ? colors.inkMuted.dark : colors.inkMuted.light
  const forgotPassword = useForgotPassword()

  const [email, setEmail] = useState('')
  const isValid = email.trim().length > 0

  function handleSubmit() {
    if (!isValid || forgotPassword.isPending) return
    forgotPassword.mutate(email.trim())
  }

  if (forgotPassword.isSuccess) {
    return (
      <View className="flex-1 items-center justify-center bg-surface-light px-6 dark:bg-surface-dark">
        <Text className="mb-2 text-center text-2xl font-bold text-ink-light dark:text-ink-dark">
          {t('auth.forgotPassword.successTitle')}
        </Text>
        <Text className="mb-6 text-center text-base text-inkMuted-light dark:text-inkMuted-dark">
          {t('auth.forgotPassword.successBody')}
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
          {t('auth.forgotPassword.title')}
        </Text>

        <Text className="mb-1 text-sm text-inkMuted-light dark:text-inkMuted-dark">
          {t('auth.forgotPassword.emailLabel')}
        </Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder={t('auth.forgotPassword.emailPlaceholder')}
          placeholderTextColor={placeholderColor}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
          className="mb-4 rounded-xl border border-border-light bg-surfaceMuted-light px-4 py-3 text-ink-light dark:border-border-dark dark:bg-surfaceMuted-dark dark:text-ink-dark"
        />

        {forgotPassword.isError && (
          <Text className="mb-4 text-center text-sm text-red-600 dark:text-red-400">
            {t(mapAuthError('forgotPassword', forgotPassword.error))}
          </Text>
        )}

        <Pressable
          onPress={handleSubmit}
          disabled={!isValid || forgotPassword.isPending}
          className="items-center rounded-xl bg-slate-900 px-4 py-3 active:opacity-70 disabled:opacity-40 dark:bg-slate-100"
        >
          {forgotPassword.isPending ? (
            <ActivityIndicator color={scheme === 'dark' ? colors.surface.dark : colors.surface.light} />
          ) : (
            <Text className="font-semibold text-white dark:text-slate-900">
              {t('auth.forgotPassword.submit')}
            </Text>
          )}
        </Pressable>

        <Link
          href="/sign-in"
          className="mt-6 text-center text-sm font-semibold text-accent-light dark:text-accent-dark"
        >
          {t('auth.forgotPassword.backToSignIn')}
        </Link>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}
