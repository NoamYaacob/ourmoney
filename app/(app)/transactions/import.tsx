// CSV import wizard — reached from the Transactions screen, not Settings
// (matches PROJECT_SPEC.md listing it under Transactions). Single screen,
// local component state only (no new store) — pick file -> map columns ->
// preview (valid/invalid/duplicate/selected + running count) -> confirm.
// No DB write happens before the explicit confirm action.

import { useMemo, useState } from 'react'
import { ScrollView, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Ionicons } from '@expo/vector-icons'
import { useColorScheme } from 'nativewind'
import { colors } from '@/constants/colors'
import { ICON } from '@/constants/icons'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { useHousehold } from '@/features/household/hooks/useHousehold'
import { useAccounts } from '@/features/accounts/hooks/useAccounts'
import { useTransactions, fetchFreshTransactionsForAccount } from '@/features/transactions/hooks/useTransactions'
import { useCreateTransaction } from '@/features/transactions/hooks/useCreateTransaction'
import { pickAndReadCsvFile } from '@/features/import/lib/readCsvFile'
import { decodeCsvBytes, type DetectedEncoding } from '@/features/import/lib/decodeCsvBytes'
import { parseCsv } from '@/features/import/lib/parseCsv'
import { applyHeaderOffset } from '@/features/import/lib/applyHeaderOffset'
import { mapCsvColumns, type CsvColumnRole } from '@/features/import/lib/mapCsvColumns'
import { validateImportRow, type ValidatedImportRow } from '@/features/import/lib/validateImportRow'
import { isDuplicateCandidate, type ExistingTransactionForDedup } from '@/features/import/lib/detectDuplicates'
import { formatILS } from '@/lib/money/format'
import { formatDateDisplay } from '@/lib/dates/format'
import { Screen } from '@/components/ui/Screen'
import { Card } from '@/components/ui/Card'
import { Select } from '@/components/ui/Select'
import { Chip } from '@/components/ui/Chip'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { DESKTOP_PANEL_CLASS } from '@/constants/layout'

const COLUMN_ROLES: CsvColumnRole[] = ['ignore', 'date', 'description', 'merchant', 'amount', 'debit', 'credit']
const STEPS: ('pick' | 'map' | 'preview' | 'done')[] = ['pick', 'map', 'preview', 'done']

interface PreviewRow {
  index: number
  validation: ValidatedImportRow
  isDuplicate: boolean
  selected: boolean
}

export default function TransactionsImport() {
  const { t } = useTranslation()
  const router = useRouter()
  const { user } = useAuth()
  const { householdId } = useHousehold(user?.id)
  const { accounts } = useAccounts(householdId)
  const createTransaction = useCreateTransaction(householdId)
  const { colorScheme: scheme } = useColorScheme()
  const accentColor = scheme === 'dark' ? colors.accent.dark : colors.accent.light

  const [step, setStep] = useState<'pick' | 'map' | 'preview' | 'done'>('pick')
  const [pickError, setPickError] = useState<string | null>(null)
  const [fileName, setFileName] = useState('')
  const [detectedEncoding, setDetectedEncoding] = useState<DetectedEncoding | null>(null)
  // fullTable holds the ENTIRE parsed file (header row + data rows
  // together, nothing pre-split) so headerOffset can be changed after the
  // fact and re-sliced — see applyHeaderOffset.ts. headers/rawRows below
  // are always the current derived view of fullTable at headerOffset.
  const [fullTable, setFullTable] = useState<string[][]>([])
  const [headerOffset, setHeaderOffset] = useState(0)
  const [headers, setHeaders] = useState<string[]>([])
  const [rawRows, setRawRows] = useState<string[][]>([])
  const [columnMapping, setColumnMapping] = useState<Record<number, CsvColumnRole>>({})
  const [accountId, setAccountId] = useState<string | null>(null)
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([])
  const [commitError, setCommitError] = useState<string | null>(null)
  const [isCommitting, setIsCommitting] = useState(false)
  const [importedCount, setImportedCount] = useState(0)
  const [skippedDuplicateCount, setSkippedDuplicateCount] = useState(0)

  // A wide window of existing transactions for the chosen account, used
  // purely for client-side duplicate detection — no DB write involved.
  // isLoading gates the map->preview transition below (Milestone A fix):
  // the importer must never compute duplicates from a still-loading query.
  const { transactions: existingTransactions, isLoading: isLoadingExistingTransactions } = useTransactions(
    householdId,
    accountId ? { accountId } : {}
  )

  async function handlePickFile() {
    setPickError(null)
    try {
      const picked = await pickAndReadCsvFile()
      if (!picked) return // user cancelled
      const decoded = decodeCsvBytes(picked.bytes)
      const parsed = parseCsv(decoded.text)
      // An empty file (or one with no parseable header row at all) has no
      // columns to map — proceeding to the map step would show a
      // column-less screen with no way forward. Report it as a file error
      // instead of a silent dead end.
      if (parsed.headers.length === 0) {
        setPickError(t('import.errors.emptyFile'))
        return
      }
      setFileName(picked.name)
      setDetectedEncoding(decoded.detectedEncoding)
      // Reassembled as one table (header row + data rows together) rather
      // than kept split, so a later header-offset change can re-slice from
      // scratch — see applyHeaderOffset.ts's own comment for why parseCsv.ts
      // itself is left untouched (it always treats row 0 as the header).
      const table = [parsed.headers, ...parsed.rows]
      setFullTable(table)
      setHeaderOffset(0)
      setHeaders(parsed.headers)
      setRawRows(parsed.rows)
      setColumnMapping({})
      setStep('map')
    } catch {
      setPickError(t('import.errors.readFailed'))
    }
  }

  // Generic preamble tolerance (Milestone A): re-slices the already-parsed
  // full table at the user-specified offset. No bank-specific detection —
  // a plain "how many rows come before the real header" number, defaulting
  // to 0. Resets columnMapping since the columns' meanings likely changed.
  function handleHeaderOffsetChange(text: string) {
    const n = Math.max(0, Math.trunc(Number(text)) || 0)
    setHeaderOffset(n)
    const { headers: newHeaders, rows: newRows } = applyHeaderOffset(fullTable, n)
    setHeaders(newHeaders)
    setRawRows(newRows)
    setColumnMapping({})
  }

  function handleConfirmMapping() {
    if (!accountId || isLoadingExistingTransactions) return
    const mapped = mapCsvColumns(rawRows, columnMapping)
    const rows: PreviewRow[] = mapped.map((row, index) => {
      const validation = validateImportRow(row)
      const isDuplicate =
        validation.valid &&
        isDuplicateCandidate(
          validation.row,
          accountId,
          existingTransactions
            .filter((t) => t.account_id === accountId)
            .map((t) => ({
              accountId: t.account_id,
              txnDate: t.txn_date,
              amountAgorot: t.amount_agorot,
              description: t.description,
            }))
        )
      return { index, validation, isDuplicate, selected: validation.valid && !isDuplicate }
    })
    setPreviewRows(rows)
    setStep('preview')
  }

  function toggleRow(index: number) {
    setPreviewRows((rows) => rows.map((r) => (r.index === index ? { ...r, selected: !r.selected } : r)))
  }

  const selectedCount = useMemo(() => previewRows.filter((r) => r.selected).length, [previewRows])

  async function handleCommit() {
    if (!householdId || !accountId || isCommitting) return
    setCommitError(null)
    setIsCommitting(true)

    // Milestone A fix: the preview-time dedup pass (handleConfirmMapping,
    // above) only ever reads the possibly-stale TanStack Query cache. A
    // normal immediate second import in the same client session — e.g. the
    // user re-opens this screen and re-picks the same file right after a
    // successful import — must not slip past that stale snapshot. Right
    // before any write, fetch a definitely-current snapshot straight from
    // the server and re-run duplicate detection against it. This does not
    // add DB-level idempotency (no UNIQUE constraint, no upsert) — true
    // protection against a genuinely concurrent second client (two tabs,
    // a retried request) remains unresolved; see this file's own note
    // below and the milestone report.
    let freshExisting: ExistingTransactionForDedup[]
    try {
      const fresh = await fetchFreshTransactionsForAccount(householdId, accountId)
      freshExisting = fresh.map((t) => ({
        accountId: t.account_id,
        txnDate: t.txn_date,
        amountAgorot: t.amount_agorot,
        description: t.description,
      }))
    } catch {
      setIsCommitting(false)
      setCommitError(t('import.errors.dedupRecheckFailed'))
      return
    }

    const candidateRows = previewRows.filter((r) => r.selected && r.validation.valid)
    const toImport = candidateRows.filter((r) => {
      if (!r.validation.valid) return false
      return !isDuplicateCandidate(r.validation.row, accountId, freshExisting)
    })
    const skippedAsDuplicate = candidateRows.length - toImport.length

    let succeeded = 0
    const CONCURRENCY = 4
    for (let i = 0; i < toImport.length; i += CONCURRENCY) {
      const batch = toImport.slice(i, i + CONCURRENCY)
      const results = await Promise.allSettled(
        batch.map((r) => {
          const row = r.validation.valid ? r.validation.row : null
          if (!row) return Promise.resolve()
          return createTransaction.mutateAsync({
            householdId,
            accountId,
            amountAgorot: row.amountAgorot,
            description: row.description,
            merchantName: row.merchantName,
            txnDate: row.txnDate,
            isShared: true,
            source: 'csv_import',
          })
        })
      )
      succeeded += results.filter((r) => r.status === 'fulfilled').length
    }

    setImportedCount(succeeded)
    setSkippedDuplicateCount(skippedAsDuplicate)
    setIsCommitting(false)
    if (succeeded < toImport.length) {
      setCommitError(t('import.errors.partialFailure', { succeeded, total: toImport.length }))
    }
    setStep('done')
  }

  // KNOWN LIMITATION (Milestone A, documented per the approved scope —
  // not fixed here): this commit-time recheck closes the same-session
  // stale-cache race, but transactions has no DB-level uniqueness
  // constraint or upsert-on-conflict (deliberately, per migration
  // 002_financial_schema.sql's own comment — dedup is scored application
  // logic, not a DB constraint). Two genuinely concurrent clients (two
  // browser tabs, or a retried request racing this exact recheck) can
  // still both pass this check and both write. True concurrent-client
  // idempotency requires a database-level change and is out of scope for
  // this milestone.

  const accountOptions = accounts.map((a) => ({ value: a.id, label: a.name }))

  const currentStepIndex = STEPS.indexOf(step)

  return (
    <Screen width="form">
      <Text className="mb-2 text-title font-bold text-ink-light dark:text-ink-dark web:desktop:text-[28px]">
        {t('import.title')}
      </Text>

      {/* Visual QA + Desktop Polish pass: a compact step indicator — the
          screen previously gave no sense of where "pick a file" sits within
          the larger pick->map->preview->done flow, especially once the
          drop-zone below replaced a single bare button. Desktop-only
          (`hidden web:desktop:flex`): mobile keeps its original, simpler
          per-step text-only flow untouched. Purely presentational — reads
          off the same `step` state the flow itself already drives, no new
          state or step semantics. */}
      <View className="mb-6 hidden web:desktop:flex web:desktop:flex-row web:desktop:items-center">
        {STEPS.map((s, index) => {
          const isDone = index < currentStepIndex
          const isCurrent = index === currentStepIndex
          return (
            <View key={s} className="flex-row items-center">
              <View className="flex-row items-center gap-1.5">
                <View
                  className={`h-5 w-5 items-center justify-center rounded-full ${
                    isDone || isCurrent
                      ? 'bg-accent-light dark:bg-accent-dark'
                      : 'border border-border-light bg-surfaceMuted-light dark:border-border-dark dark:bg-surfaceMuted-dark'
                  }`}
                >
                  {isDone ? (
                    <Ionicons name="checkmark" size={12} color="#ffffff" />
                  ) : (
                    <Text
                      className={`text-xs font-semibold ${
                        isCurrent ? 'text-white' : 'text-inkMuted-light dark:text-inkMuted-dark'
                      }`}
                    >
                      {index + 1}
                    </Text>
                  )}
                </View>
                <Text
                  className={
                    isCurrent
                      ? 'text-caption font-semibold text-ink-light dark:text-ink-dark'
                      : 'text-caption text-inkMuted-light dark:text-inkMuted-dark'
                  }
                >
                  {t(`import.steps.${s}`)}
                </Text>
              </View>
              {index < STEPS.length - 1 && (
                <View className="mx-3 h-px w-8 bg-border-light dark:bg-border-dark" />
              )}
            </View>
          )
        })}
      </View>

      {step === 'pick' && (
        <View>
          {/* Visual QA + Desktop Polish pass: a drop-zone-styled prompt
              instead of a bare "pick a file" button + caption — this was
              the single most-cited "essentially an empty page" screen in
              the desktop review. Still exactly one action
              (handlePickFile via the native file picker; there is no actual
              drag-and-drop handling here, so the copy says "choose a file,"
              never "drag and drop," and nothing about the pick flow itself
              changed). */}
          <View className="items-center rounded-card border-2 border-dashed border-border-light bg-surfaceMuted-light px-6 py-10 web:desktop:py-14 dark:border-border-dark dark:bg-surfaceMuted-dark">
            <View className="h-12 w-12 items-center justify-center rounded-full bg-accent-light/10 dark:bg-accent-dark/10">
              <Ionicons name="cloud-upload-outline" size={ICON.hero} color={accentColor} />
            </View>
            <Text className="mt-4 text-body font-semibold text-ink-light dark:text-ink-dark">
              {t('import.pickHint')}
            </Text>
            <Text className="mt-1 text-caption text-inkMuted-light dark:text-inkMuted-dark">
              {t('import.pickFormatHint')}
            </Text>
            <View className="mt-5">
              <Button title={t('import.pickButton')} onPress={() => void handlePickFile()} />
            </View>
          </View>
          {pickError && (
            <View className="mt-4">
              <ErrorMessage message={pickError} />
            </View>
          )}
        </View>
      )}

      {/* Visual QA + Desktop Polish pass: map/preview/done now share the
          same bounded desktop panel token as the pick step (and every other
          screen) — previously only the pick step had any desktop framing,
          so the wizard read as one polished screen followed by three plain
          ones. Mobile/tablet untouched. */}
      {step === 'map' && (
        <View className={DESKTOP_PANEL_CLASS}>
          <Text className="mb-2 text-sm text-inkMuted-light dark:text-inkMuted-dark">
            {t('import.fileLabel')} {fileName}
            {detectedEncoding ? ` (${detectedEncoding})` : ''}
          </Text>

          <View className="web:desktop:flex-row web:desktop:gap-4">
            <View className="web:desktop:flex-1">
              <Select
                label={t('import.accountLabel')}
                options={accountOptions}
                value={accountId}
                onChange={setAccountId}
                placeholder={t('import.accountLabel')}
              />
            </View>
            {/* Generic preamble tolerance (Milestone A) — no bank
                auto-detection, just a user-specified "rows before the real
                header" count. Re-slices fullTable, which already holds the
                whole parsed file. */}
            <View className="web:desktop:flex-1">
              <Input
                label={t('import.headerOffsetLabel')}
                value={String(headerOffset)}
                onChangeText={handleHeaderOffsetChange}
                keyboardType="number-pad"
              />
            </View>
          </View>
          {isLoadingExistingTransactions && (
            <Text className="mb-2 text-xs text-inkMuted-light dark:text-inkMuted-dark">
              {t('import.checkingExistingTransactions')}
            </Text>
          )}
          <Text className="-mt-2 mb-4 text-xs text-inkMuted-light dark:text-inkMuted-dark">
            {t('import.headerOffsetHint')}
          </Text>
          {fullTable.length > 0 && headers.length === 0 && (
            <ErrorMessage message={t('import.headerOffsetNoHeaderWarning')} />
          )}

          <Text className="mb-2 mt-4 text-sm font-semibold text-inkMuted-light dark:text-inkMuted-dark">
            {t('import.mapColumnsTitle')}
          </Text>
          {headers.map((header, index) => (
            <View key={`${header}-${index}`} className="mb-3">
              <Text className="mb-1 text-sm text-ink-light dark:text-ink-dark">{header || `#${index + 1}`}</Text>
              <View className="flex-row flex-wrap gap-2">
                {COLUMN_ROLES.map((role) => (
                  <Chip
                    key={role}
                    testID={`import-column-role-${index}-${role}`}
                    label={t(`import.columnRole.${role}`)}
                    selected={(columnMapping[index] ?? 'ignore') === role}
                    onPress={() => setColumnMapping((m) => ({ ...m, [index]: role }))}
                  />
                ))}
              </View>
            </View>
          ))}

          <Button
            title={t('import.mapColumnsSubmit')}
            onPress={handleConfirmMapping}
            disabled={!accountId || isLoadingExistingTransactions}
          />
        </View>
      )}

      {step === 'preview' && (
        <View className={`flex-1 ${DESKTOP_PANEL_CLASS}`}>
          <Text className="mb-4 text-sm font-semibold text-inkMuted-light dark:text-inkMuted-dark">
            {t('import.previewCount', { selected: selectedCount, total: previewRows.length })}
          </Text>
          <ScrollView className="mb-4" style={{ maxHeight: 420 }}>
            {previewRows.map((row) => (
              <View key={row.index} className="mb-2">
                <Card>
                  {row.validation.valid ? (
                    <View className="flex-row items-center justify-between">
                      <View className="flex-1">
                        <Text className="text-sm text-ink-light dark:text-ink-dark">
                          {row.validation.row.description}
                          {row.validation.row.merchantName ? ` · ${row.validation.row.merchantName}` : ''}
                        </Text>
                        <Text className="text-xs text-inkMuted-light dark:text-inkMuted-dark">
                          {formatDateDisplay(row.validation.row.txnDate)} · {formatILS(row.validation.row.amountAgorot)}
                          {row.isDuplicate ? ` · ${t('import.duplicateFlag')}` : ''}
                        </Text>
                      </View>
                      <Chip
                        label={row.selected ? t('import.selected') : t('import.notSelected')}
                        selected={row.selected}
                        onPress={() => toggleRow(row.index)}
                      />
                    </View>
                  ) : (
                    <Text className="text-sm text-danger-light dark:text-danger-dark">
                      {t('import.invalidRow', { reason: t(`import.invalidReason.${row.validation.reason}`) })}
                    </Text>
                  )}
                </Card>
              </View>
            ))}
          </ScrollView>

          {commitError && <ErrorMessage message={commitError} />}
          <Button
            title={t('import.confirmButton', { count: selectedCount })}
            onPress={() => void handleCommit()}
            loading={isCommitting}
            disabled={selectedCount === 0}
          />
        </View>
      )}

      {step === 'done' && (
        <View className={`web:desktop:items-center ${DESKTOP_PANEL_CLASS}`}>
          <Text className="mb-4 text-base text-ink-light dark:text-ink-dark">
            {t('import.doneMessage', { count: importedCount })}
          </Text>
          {skippedDuplicateCount > 0 && (
            <Text className="mb-4 text-sm text-inkMuted-light dark:text-inkMuted-dark">
              {t('import.duplicatesSkippedAtCommit', { count: skippedDuplicateCount })}
            </Text>
          )}
          {commitError && <ErrorMessage message={commitError} />}
          <View className="web:desktop:w-full web:desktop:max-w-[280px]">
            <Button title={t('import.backToTransactions')} onPress={() => router.back()} />
          </View>
        </View>
      )}

      {isCommitting && <LoadingSpinner />}
    </Screen>
  )
}
