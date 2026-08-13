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
import { afterEach, describe, expect, it, jest } from '@jest/globals'
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
jest.mock('@/features/transactions/hooks/useTransactions', () => ({
  useTransactions: () => ({ transactions: [] }),
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
})
