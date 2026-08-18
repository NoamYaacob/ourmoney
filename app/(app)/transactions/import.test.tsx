// Screen-level regression tests for the CSV import wizard's orchestration
// invariants that no lower-level unit test can prove on its own:
//   - nothing is written to the database until the user presses the
//     explicit "import N transactions" confirm button (never earlier, e.g.
//     right after mapping columns)
//   - a confirmed import calls the exact same createTransaction mutation
//     manual entry uses (same RLS, same matchRule auto-categorization),
//     once per selected+valid row
//   - a row that fails validation (bad date/amount) never reaches the
//     mutation, even if every other row in the same file succeeds
//   - file-read/parse failures (empty file, decode failure) surface as a
//     visible error and leave the user on the pick step — never a crash,
//     never a silent no-op that looks like success
// Every hook that touches Supabase/network is mocked; decodeCsvBytes,
// parseCsv, mapCsvColumns, validateImportRow, and isDuplicateCandidate run
// for real, so this also exercises the actual parsing/validation pipeline
// end to end, the same way a real picked file would.
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
import { fireEvent, render, waitFor } from '@testing-library/react-native'
import '@/i18n'
import TransactionsImport from './import'
import { pickAndReadCsvFile } from '@/features/import/lib/readCsvFile'

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn() }),
}))
jest.mock('@/features/auth/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}))
jest.mock('@/features/household/hooks/useHousehold', () => ({
  useHousehold: () => ({ householdId: 'household-1' }),
}))
jest.mock('@/features/accounts/hooks/useAccounts', () => ({
  useAccounts: () => ({ accounts: [{ id: 'acct-1', name: 'עו״ש' }] }),
}))
const mockFetchFreshTransactionsForAccount = jest.fn<(...args: unknown[]) => Promise<unknown[]>>().mockResolvedValue([])
let mockExistingTransactions: unknown[] = []
let mockIsLoadingExistingTransactions = false
jest.mock('@/features/transactions/hooks/useTransactions', () => ({
  useTransactions: () => ({ transactions: mockExistingTransactions, isLoading: mockIsLoadingExistingTransactions }),
  fetchFreshTransactionsForAccount: (...args: unknown[]) => mockFetchFreshTransactionsForAccount(...args),
}))
const mockMutateAsync = jest.fn<(...args: unknown[]) => Promise<string>>().mockResolvedValue('txn-1')
jest.mock('@/features/transactions/hooks/useCreateTransaction', () => ({
  useCreateTransaction: () => ({ mutateAsync: mockMutateAsync }),
}))
jest.mock('@/features/import/lib/readCsvFile', () => ({
  pickAndReadCsvFile: jest.fn(),
}))
// Avoids a deep, environment-specific import chain
// (@expo/vector-icons -> expo-font -> expo-asset) unrelated to what this
// test verifies — same rationale as app/(app)/_layout.test.tsx's identical
// mock (components/ui/Select.tsx renders an Ionicons chevron).
jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}))

function csvBytes(text: string): Uint8Array {
  return new TextEncoder().encode(text)
}

// Drives the screen from the pick step through to the mapping-submitted
// preview step: pick the file, choose the (only) account, map the 3
// columns of the fixture CSVs below (date, description, amount), submit.
type RenderResult = Awaited<ReturnType<typeof render>>

async function driveToPreview(getByText: RenderResult['getByText'], getByTestId: RenderResult['getByTestId'], getByRole: RenderResult['getByRole']) {
  await fireEvent.press(getByText('בחירת קובץ'))
  await waitFor(() => expect(getByText('התאמת עמודות')).toBeTruthy())

  await fireEvent.press(getByRole('button', { name: 'חשבון יעד' }))
  await fireEvent.press(getByText('עו״ש'))

  await fireEvent.press(getByTestId('import-column-role-0-date'))
  await fireEvent.press(getByTestId('import-column-role-1-description'))
  await fireEvent.press(getByTestId('import-column-role-2-amount'))

  await fireEvent.press(getByText('המשך לתצוגה מקדימה'))
  await waitFor(() => expect(getByText(/נבחרו לייבוא/)).toBeTruthy())
}

describe('TransactionsImport', () => {
  beforeEach(() => {
    mockExistingTransactions = []
    mockIsLoadingExistingTransactions = false
    mockFetchFreshTransactionsForAccount.mockResolvedValue([])
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('writes nothing to the database until the confirm button is pressed, then imports each selected valid row via the existing createTransaction mutation', async () => {
    jest.mocked(pickAndReadCsvFile).mockResolvedValue({
      name: 'transactions.csv',
      bytes: csvBytes('date,description,amount\n01/01/2026,קפה,-20\n02/01/2026,משכורת,5000'),
    })

    const { getByText, getByTestId, getByRole } = await render(<TransactionsImport />)
    await driveToPreview(getByText, getByTestId, getByRole)

    // Reached the preview step (which already ran validation/dedup) —
    // still nothing must have been written.
    expect(mockMutateAsync).not.toHaveBeenCalled()

    await fireEvent.press(getByText(/ייבוא \d+ תנועות/))

    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(2))
    expect(mockMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        householdId: 'household-1',
        accountId: 'acct-1',
        description: 'קפה',
        amountAgorot: -2000,
        txnDate: '2026-01-01',
        source: 'csv_import',
      })
    )
    expect(mockMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        description: 'משכורת',
        amountAgorot: 500000,
        txnDate: '2026-01-02',
      })
    )
    await waitFor(() => expect(getByText(/יובאו 2 תנועות/)).toBeTruthy())
  })

  it('flags a row with an invalid date as invalid and never sends it to the mutation, while still importing the valid rows in the same file', async () => {
    jest.mocked(pickAndReadCsvFile).mockResolvedValue({
      name: 'transactions.csv',
      bytes: csvBytes('date,description,amount\n01/01/2026,קפה,-20\nnot-a-date,תקלה,10'),
    })

    const { getByText, getByTestId, getByRole } = await render(<TransactionsImport />)
    await driveToPreview(getByText, getByTestId, getByRole)

    expect(getByText(/תאריך לא תקין/)).toBeTruthy()
    expect(getByText(/1 מתוך 2 נבחרו/)).toBeTruthy()

    await fireEvent.press(getByText(/ייבוא \d+ תנועות/))

    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1))
    expect(mockMutateAsync).toHaveBeenCalledWith(expect.objectContaining({ description: 'קפה' }))
  })

  it('shows a file error and stays on the pick step for an empty CSV, without ever reaching the mutation', async () => {
    jest.mocked(pickAndReadCsvFile).mockResolvedValue({ name: 'empty.csv', bytes: csvBytes('') })

    const { getByText } = await render(<TransactionsImport />)
    await fireEvent.press(getByText('בחירת קובץ'))

    await waitFor(() => expect(getByText('הקובץ ריק או שלא נמצאו בו עמודות. בחרו קובץ CSV אחר')).toBeTruthy())
    expect(mockMutateAsync).not.toHaveBeenCalled()
  })

  it('shows a file error and stays on the pick step when the file read throws (unreadable/invalid file)', async () => {
    jest.mocked(pickAndReadCsvFile).mockRejectedValue(new Error('boom'))

    const { getByText } = await render(<TransactionsImport />)
    await fireEvent.press(getByText('בחירת קובץ'))

    await waitFor(() => expect(getByText('קריאת הקובץ נכשלה. נסו שוב')).toBeTruthy())
    expect(mockMutateAsync).not.toHaveBeenCalled()
  })

  it('does nothing and shows no error when the user cancels the file picker', async () => {
    jest.mocked(pickAndReadCsvFile).mockResolvedValue(null)

    const { getByText, queryByText } = await render(<TransactionsImport />)
    await fireEvent.press(getByText('בחירת קובץ'))

    await waitFor(() => expect(jest.mocked(pickAndReadCsvFile)).toHaveBeenCalledTimes(1))
    expect(getByText('בחירת קובץ')).toBeTruthy() // still on the pick step
    expect(queryByText('התאמת עמודות')).toBeNull()
    expect(mockMutateAsync).not.toHaveBeenCalled()
  })

  // Milestone A: the importer must never compute duplicates from an
  // account query that is still loading (useTransactions().isLoading).
  it('does not advance past the map step while the existing-transactions query for the chosen account is still loading', async () => {
    mockIsLoadingExistingTransactions = true
    jest.mocked(pickAndReadCsvFile).mockResolvedValue({
      name: 'transactions.csv',
      bytes: csvBytes('date,description,amount\n01/01/2026,קפה,-20'),
    })

    const { getByText, getByTestId, getByRole, queryByText } = await render(<TransactionsImport />)
    await fireEvent.press(getByText('בחירת קובץ'))
    await waitFor(() => expect(getByText('התאמת עמודות')).toBeTruthy())
    await fireEvent.press(getByRole('button', { name: 'חשבון יעד' }))
    await fireEvent.press(getByText('עו״ש'))
    await fireEvent.press(getByTestId('import-column-role-0-date'))
    await fireEvent.press(getByTestId('import-column-role-1-description'))
    await fireEvent.press(getByTestId('import-column-role-2-amount'))

    await fireEvent.press(getByText('המשך לתצוגה מקדימה'))

    // Still on the map step — the button press was a no-op while loading.
    expect(getByText('התאמת עמודות')).toBeTruthy()
    expect(queryByText(/נבחרו לייבוא/)).toBeNull()
  })

  // Milestone A: before final import confirmation, a fresh/current
  // transaction snapshot is fetched and duplicate detection re-runs
  // against it — this is what makes a normal immediate second import in
  // the same client session get caught even though the preview step's own
  // dedup pass only saw the (still-empty, per this test's mock) TanStack
  // Query cache.
  it('re-checks duplicates against a freshly-fetched snapshot before committing, skipping a row the stale preview-time cache missed', async () => {
    jest.mocked(pickAndReadCsvFile).mockResolvedValue({
      name: 'transactions.csv',
      bytes: csvBytes('date,description,amount\n01/01/2026,קפה,-20\n02/01/2026,משכורת,5000'),
    })
    // The preview-time cache (mockExistingTransactions) is empty — neither
    // row is flagged as a duplicate in preview. The fresh commit-time fetch
    // reveals the coffee row was already imported (e.g. by an immediately
    // prior import in this same session) — its snapshot must win.
    mockFetchFreshTransactionsForAccount.mockResolvedValue([
      { account_id: 'acct-1', txn_date: '2026-01-01', amount_agorot: -2000, description: 'קפה' },
    ])

    const { getByText, getByTestId, getByRole } = await render(<TransactionsImport />)
    await driveToPreview(getByText, getByTestId, getByRole)

    // Preview never saw the duplicate (stale/empty cache) — both rows
    // start selected.
    expect(getByText(/2 מתוך 2 נבחרו/)).toBeTruthy()

    await fireEvent.press(getByText(/ייבוא \d+ תנועות/))

    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1))
    expect(mockMutateAsync).toHaveBeenCalledWith(expect.objectContaining({ description: 'משכורת' }))
    expect(mockMutateAsync).not.toHaveBeenCalledWith(expect.objectContaining({ description: 'קפה' }))
    await waitFor(() => expect(getByText(/1 תנועות דולגו כי כבר יובאו/)).toBeTruthy())
  })

  it('shows an error and writes nothing when the fresh duplicate-check fetch itself fails', async () => {
    jest.mocked(pickAndReadCsvFile).mockResolvedValue({
      name: 'transactions.csv',
      bytes: csvBytes('date,description,amount\n01/01/2026,קפה,-20'),
    })
    mockFetchFreshTransactionsForAccount.mockRejectedValue(new Error('network error'))

    const { getByText, getByTestId, getByRole } = await render(<TransactionsImport />)
    await driveToPreview(getByText, getByTestId, getByRole)

    await fireEvent.press(getByText(/ייבוא \d+ תנועות/))

    await waitFor(() => expect(getByText('בדיקת כפילויות נכשלה לפני הייבוא. נסו שוב')).toBeTruthy())
    expect(mockMutateAsync).not.toHaveBeenCalled()
  })

  // Milestone A: generic preamble tolerance — a user-specified "rows before
  // the real header" count, with no bank-specific detection involved.
  it('imports correctly from a file with introductory rows before the real header, once the header offset is set', async () => {
    jest.mocked(pickAndReadCsvFile).mockResolvedValue({
      name: 'transactions.csv',
      bytes: csvBytes(
        'Account Summary Export\nGenerated: 2026-01-01\ndate,description,amount\n01/01/2026,קפה,-20'
      ),
    })

    const { getByText, getByTestId, getByRole, getByLabelText } = await render(<TransactionsImport />)
    await fireEvent.press(getByText('בחירת קובץ'))
    await waitFor(() => expect(getByText('התאמת עמודות')).toBeTruthy())

    // Before setting the offset, row 0 ("Account Summary Export") is
    // wrongly treated as the header — a single column with no real
    // meaning to map to date/description/amount.
    expect(getByText('Account Summary Export')).toBeTruthy()

    await fireEvent.changeText(getByLabelText('מספר שורות לדילוג לפני שורת הכותרת'), '2')

    // The real header row's columns are now visible for mapping.
    expect(getByText('date')).toBeTruthy()
    expect(getByText('description')).toBeTruthy()
    expect(getByText('amount')).toBeTruthy()

    await fireEvent.press(getByRole('button', { name: 'חשבון יעד' }))
    await fireEvent.press(getByText('עו״ש'))
    await fireEvent.press(getByTestId('import-column-role-0-date'))
    await fireEvent.press(getByTestId('import-column-role-1-description'))
    await fireEvent.press(getByTestId('import-column-role-2-amount'))
    await fireEvent.press(getByText('המשך לתצוגה מקדימה'))

    await waitFor(() => expect(getByText(/1 מתוך 1 נבחרו/)).toBeTruthy())
    await fireEvent.press(getByText(/ייבוא \d+ תנועות/))

    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1))
    expect(mockMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ description: 'קפה', amountAgorot: -2000, txnDate: '2026-01-01' })
    )
  })

  // Milestone A: merchant is a new generic mapping role, threaded through
  // to the same merchantName field manual transaction entry already
  // persists (transactions.merchant_name — no schema change).
  it('maps a merchant column and persists it as merchantName on import', async () => {
    jest.mocked(pickAndReadCsvFile).mockResolvedValue({
      name: 'transactions.csv',
      bytes: csvBytes('date,description,merchant,amount\n01/01/2026,קפה,ארומה,-20'),
    })

    const { getByText, getByTestId, getByRole } = await render(<TransactionsImport />)
    await fireEvent.press(getByText('בחירת קובץ'))
    await waitFor(() => expect(getByText('התאמת עמודות')).toBeTruthy())
    await fireEvent.press(getByRole('button', { name: 'חשבון יעד' }))
    await fireEvent.press(getByText('עו״ש'))
    await fireEvent.press(getByTestId('import-column-role-0-date'))
    await fireEvent.press(getByTestId('import-column-role-1-description'))
    await fireEvent.press(getByTestId('import-column-role-2-merchant'))
    await fireEvent.press(getByTestId('import-column-role-3-amount'))
    await fireEvent.press(getByText('המשך לתצוגה מקדימה'))
    await waitFor(() => expect(getByText(/נבחרו לייבוא/)).toBeTruthy())

    // Merchant name is visible in the preview row.
    expect(getByText(/ארומה/)).toBeTruthy()

    await fireEvent.press(getByText(/ייבוא \d+ תנועות/))

    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1))
    expect(mockMutateAsync).toHaveBeenCalledWith(expect.objectContaining({ merchantName: 'ארומה' }))
  })
})
