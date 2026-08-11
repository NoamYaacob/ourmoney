// CSV import wizard — reached from the Transactions screen, not Settings
// (matches PROJECT_SPEC.md listing it under Transactions). Single screen,
// local component state only (no new store) — pick file -> map columns ->
// preview (valid/invalid/duplicate/selected + running count) -> confirm.
// No DB write happens before the explicit confirm action.

import { useMemo, useState } from 'react'
import { ScrollView, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { useHousehold } from '@/features/household/hooks/useHousehold'
import { useAccounts } from '@/features/accounts/hooks/useAccounts'
import { useTransactions } from '@/features/transactions/hooks/useTransactions'
import { useCreateTransaction } from '@/features/transactions/hooks/useCreateTransaction'
import { pickAndReadCsvFile } from '@/features/import/lib/readCsvFile'
import { decodeCsvBytes, type DetectedEncoding } from '@/features/import/lib/decodeCsvBytes'
import { parseCsv } from '@/features/import/lib/parseCsv'
import { mapCsvColumns, type CsvColumnRole } from '@/features/import/lib/mapCsvColumns'
import { validateImportRow, type ValidatedImportRow } from '@/features/import/lib/validateImportRow'
import { isDuplicateCandidate } from '@/features/import/lib/detectDuplicates'
import { formatILS } from '@/lib/money/format'
import { Screen } from '@/components/ui/Screen'
import { Card } from '@/components/ui/Card'
import { Select } from '@/components/ui/Select'
import { Chip } from '@/components/ui/Chip'
import { Button } from '@/components/ui/Button'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { ErrorMessage } from '@/components/ui/ErrorMessage'

const COLUMN_ROLES: CsvColumnRole[] = ['ignore', 'date', 'description', 'amount', 'debit', 'credit']

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

  const [step, setStep] = useState<'pick' | 'map' | 'preview' | 'done'>('pick')
  const [pickError, setPickError] = useState<string | null>(null)
  const [fileName, setFileName] = useState('')
  const [detectedEncoding, setDetectedEncoding] = useState<DetectedEncoding | null>(null)
  const [headers, setHeaders] = useState<string[]>([])
  const [rawRows, setRawRows] = useState<string[][]>([])
  const [columnMapping, setColumnMapping] = useState<Record<number, CsvColumnRole>>({})
  const [accountId, setAccountId] = useState<string | null>(null)
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([])
  const [commitError, setCommitError] = useState<string | null>(null)
  const [isCommitting, setIsCommitting] = useState(false)
  const [importedCount, setImportedCount] = useState(0)

  // A wide window of existing transactions for the chosen account, used
  // purely for client-side duplicate detection — no DB write involved.
  const { transactions: existingTransactions } = useTransactions(
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
      setFileName(picked.name)
      setDetectedEncoding(decoded.detectedEncoding)
      setHeaders(parsed.headers)
      setRawRows(parsed.rows)
      setColumnMapping({})
      setStep('map')
    } catch {
      setPickError(t('import.errors.readFailed'))
    }
  }

  function handleConfirmMapping() {
    if (!accountId) return
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

    const toImport = previewRows.filter((r) => r.selected && r.validation.valid)
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
            txnDate: row.txnDate,
            isShared: true,
            source: 'csv_import',
          })
        })
      )
      succeeded += results.filter((r) => r.status === 'fulfilled').length
    }

    setImportedCount(succeeded)
    setIsCommitting(false)
    if (succeeded < toImport.length) {
      setCommitError(t('import.errors.partialFailure', { succeeded, total: toImport.length }))
    }
    setStep('done')
  }

  const accountOptions = accounts.map((a) => ({ value: a.id, label: a.name }))

  return (
    <Screen>
      <Text className="mb-6 text-2xl font-bold text-ink-light dark:text-ink-dark">{t('import.title')}</Text>

      {step === 'pick' && (
        <View>
          <Text className="mb-4 text-sm text-inkMuted-light dark:text-inkMuted-dark">{t('import.pickHint')}</Text>
          {pickError && <ErrorMessage message={pickError} />}
          <Button title={t('import.pickButton')} onPress={() => void handlePickFile()} />
        </View>
      )}

      {step === 'map' && (
        <View>
          <Text className="mb-2 text-sm text-inkMuted-light dark:text-inkMuted-dark">
            {t('import.fileLabel')} {fileName}
            {detectedEncoding ? ` (${detectedEncoding})` : ''}
          </Text>

          <Select
            label={t('import.accountLabel')}
            options={accountOptions}
            value={accountId}
            onChange={setAccountId}
            placeholder={t('import.accountLabel')}
          />

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
            disabled={!accountId}
          />
        </View>
      )}

      {step === 'preview' && (
        <View className="flex-1">
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
                        </Text>
                        <Text className="text-xs text-inkMuted-light dark:text-inkMuted-dark">
                          {row.validation.row.txnDate} · {formatILS(row.validation.row.amountAgorot)}
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
        <View>
          <Text className="mb-4 text-base text-ink-light dark:text-ink-dark">
            {t('import.doneMessage', { count: importedCount })}
          </Text>
          {commitError && <ErrorMessage message={commitError} />}
          <Button title={t('import.backToTransactions')} onPress={() => router.back()} />
        </View>
      )}

      {isCommitting && <LoadingSpinner />}
    </Screen>
  )
}
