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
import { useSignIn } from '@/features/auth/hooks/useSignIn'
import { mapAuthError } from '@/features/auth/lib/mapAuthError'

export default function SignIn() {
  const { t } = useTranslation()
  const scheme = useColorScheme()
  const placeholderColor = scheme === 'dark' ? colors.inkMuted.dark : colors.inkMuted.light
  const signIn = useSignIn()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const isValid = email.trim().length > 0 && password.length > 0

  function handleSubmit() {
    if (!isValid || signIn.isPending) return
    signIn.mutate({ email: email.trim(), password })
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="flex-1 bg-surface-light dark:bg-surface-dark"
    >
      <ScrollView contentContainerClassName="grow justify-center px-6" keyboardShouldPersistTaps="handled">
        <Text className="mb-8 text-center text-2xl font-bold text-ink-light dark:text-ink-dark">
          {t('auth.signIn.title')}
        </Text>

        <Text className="mb-1 text-sm text-inkMuted-light dark:text-inkMuted-dark">
          {t('auth.signIn.emailLabel')}
        </Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder={t('auth.signIn.emailPlaceholder')}
          placeholderTextColor={placeholderColor}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
          className="mb-4 rounded-xl border border-border-light bg-surfaceMuted-light px-4 py-3 text-ink-light dark:border-border-dark dark:bg-surfaceMuted-dark dark:text-ink-dark"
        />

        <Text className="mb-1 text-sm text-inkMuted-light dark:text-inkMuted-dark">
          {t('auth.signIn.passwordLabel')}
        </Text>
        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder={t('auth.signIn.passwordPlaceholder')}
          placeholderTextColor={placeholderColor}
          secureTextEntry
          autoComplete="current-password"
          textContentType="password"
          className="mb-2 rounded-xl border border-border-light bg-surfaceMuted-light px-4 py-3 text-ink-light dark:border-border-dark dark:bg-surfaceMuted-dark dark:text-ink-dark"
        />

        <Link href="/forgot-password" className="mb-6 text-end text-sm text-accent-light dark:text-accent-dark">
          {t('auth.signIn.forgotPasswordLink')}
        </Link>

        {signIn.isError && (
          <Text className="mb-4 text-center text-sm text-red-600 dark:text-red-400">
            {t(mapAuthError('signIn', signIn.error))}
          </Text>
        )}

        <Pressable
          onPress={handleSubmit}
          disabled={!isValid || signIn.isPending}
          className="items-center rounded-xl bg-slate-900 px-4 py-3 active:opacity-70 disabled:opacity-40 dark:bg-slate-100"
        >
          {signIn.isPending ? (
            <ActivityIndicator color={scheme === 'dark' ? colors.surface.dark : colors.surface.light} />
          ) : (
            <Text className="font-semibold text-white dark:text-slate-900">{t('auth.signIn.submit')}</Text>
          )}
        </Pressable>

        <View className="mt-6 flex-row justify-center gap-1">
          <Text className="text-sm text-inkMuted-light dark:text-inkMuted-dark">
            {t('auth.signIn.signUpPrompt')}
          </Text>
          <Link href="/sign-up" className="text-sm font-semibold text-accent-light dark:text-accent-dark">
            {t('auth.signIn.signUpLink')}
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}
