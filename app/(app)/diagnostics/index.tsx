// Temporary, investigation-only screen — see lib/diagnostics/queryDiagnostics.ts's
// header for the full safety model and why this exists. Deliberately NOT
// registered as a visible tab or rail item (app/(app)/_layout.tsx gives it
// `options={{ href: null }}`, same as every other detail/utility screen) —
// reachable only by navigating directly to /diagnostics, and only useful
// at all once diagnostics have been turned on (open the app once with
// ?diag=1 in the URL, or use the toggle below).
//
// Deliberately plain, hardcoded English strings rather than going through
// i18n/he.json — this is a developer diagnostic tool for one specific
// investigation, not a real product screen, and is meant to be deleted
// once the real root cause behind it is found and fixed (see the PR/commit
// that added it for the full context).
//
// Remove this file, its Tabs.Screen registration, lib/diagnostics/
// queryDiagnostics.ts, and every diagnoseQuery() call site once this
// investigation is closed out.

import { useEffect, useState } from 'react'
import { Platform, ScrollView, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { Screen } from '@/components/ui/Screen'
import { Button } from '@/components/ui/Button'
import {
  clearQueryDiagnostics,
  getQueryDiagnostics,
  isDiagnosticsEnabled,
  setDiagnosticsEnabled,
  subscribeToQueryDiagnostics,
  type QueryDiagnosticEntry,
} from '@/lib/diagnostics/queryDiagnostics'

function copyToClipboard(text: string) {
  if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
    void navigator.clipboard.writeText(text)
  }
}

function entryLine(e: QueryDiagnosticEntry): string {
  const time = new Date(e.timestamp).toISOString()
  const status = e.ok ? 'OK' : 'FAIL'
  return [
    `[${time}] ${status} ${e.hook} -> ${e.table} (${e.operation})`,
    `  params: ${JSON.stringify(e.params)}`,
    `  hadUserId: ${e.hadUserId}  hadHouseholdId: ${e.hadHouseholdId}  durationMs: ${e.durationMs}`,
    e.ok
      ? undefined
      : `  status: ${e.status ?? 'n/a'}  statusText: ${e.statusText ?? 'n/a'}  code: ${e.code ?? 'n/a'}`,
    e.ok ? undefined : `  message: ${e.message ?? 'n/a'}`,
    e.ok ? undefined : `  details: ${e.details ?? 'n/a'}`,
    e.ok ? undefined : `  hint: ${e.hint ?? 'n/a'}`,
  ]
    .filter(Boolean)
    .join('\n')
}

export default function Diagnostics() {
  const router = useRouter()
  const [enabled, setEnabled] = useState(() => isDiagnosticsEnabled())
  const [entries, setEntries] = useState<QueryDiagnosticEntry[]>(() => getQueryDiagnostics())

  useEffect(() => subscribeToQueryDiagnostics(() => setEntries([...getQueryDiagnostics()])), [])

  const failed = entries.filter((e) => !e.ok)
  const dump = entries.map(entryLine).join('\n\n')

  return (
    <Screen onBack={() => router.back()} width="wide">
      <Text className="mb-2 text-title font-heebo text-ink-light dark:text-ink-dark">
        Query diagnostics (temporary)
      </Text>
      <Text className="mb-4 text-caption font-sans text-inkMuted-light dark:text-inkMuted-dark">
        Captures every instrumented Supabase request (Cash Flow / Upcoming
        Commitments / Credit &amp; Payments sources) — table, params, whether an
        authenticated user id existed, and the exact PostgREST error when one
        occurs. Nothing is captured until this is turned on, and it captures
        nothing secret (no tokens, no monetary values beyond what already
        renders in the app).
      </Text>

      <View className="mb-4 flex-row flex-wrap gap-2">
        <Button
          title={enabled ? 'Diagnostics: ON — turn off' : 'Diagnostics: OFF — turn on'}
          variant={enabled ? 'secondary' : 'primary'}
          onPress={() => {
            const next = !enabled
            setDiagnosticsEnabled(next)
            setEnabled(next)
          }}
        />
        <Button
          title={`Clear (${entries.length} captured)`}
          variant="secondary"
          onPress={() => clearQueryDiagnostics()}
        />
        {Platform.OS === 'web' && (
          <Button title="Copy all as text" variant="secondary" onPress={() => copyToClipboard(dump)} />
        )}
      </View>

      <Text className="mb-2 text-body font-sansSemibold text-ink-light dark:text-ink-dark">
        {entries.length} captured, {failed.length} failed
      </Text>

      <ScrollView className="max-h-[600px] rounded-card border border-border-light dark:border-border-dark">
        <Text selectable className="p-3 text-meta font-sans text-ink-light dark:text-ink-dark" style={{ fontFamily: Platform.OS === 'web' ? 'monospace' : undefined }}>
          {dump || '(nothing captured yet — reload this app with ?diag=1 in the URL, or use the toggle above, then navigate to Cash Flow / Home / Credit & Payments and come back here)'}
        </Text>
      </ScrollView>
    </Screen>
  )
}
