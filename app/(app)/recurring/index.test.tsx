// Desktop/RTL polish pass (real-browser regression): the 2-column wrap
// grid declared plain flex-row (not flex-row-reverse), which native
// auto-mirrors via Yoga under the forced-RTL flag but NativeWind's
// web-compiled CSS does not — the first recurring item (source order) must
// render top-right, continuing the RTL reading order into the wrap. First
// test coverage for this screen.
import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { render } from '@testing-library/react-native'
import '@/i18n'
import Recurring from './index'

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
}))
jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}))
jest.mock('@/features/auth/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}))
jest.mock('@/features/household/hooks/useHousehold', () => ({
  useHousehold: () => ({ householdId: 'household-1', isLoading: false }),
}))
jest.mock('@/features/accounts/hooks/useAccounts', () => ({
  useAccounts: () => ({ accounts: [], isLoading: false }),
}))
jest.mock('@/features/categories/hooks/useCategories', () => ({
  useCategories: () => ({ categories: [], isLoading: false }),
}))
jest.mock('@/features/recurring/hooks/useCreateRecurringTransaction', () => ({
  useCreateRecurringTransaction: () => ({ mutate: jest.fn(), isPending: false, isError: false }),
}))

const RECURRING = [
  {
    id: 'rec-1',
    description: 'שכירות',
    amount_agorot: -350000,
    frequency: 'monthly',
    next_due_date: '2026-09-01',
    is_active: true,
  },
  {
    id: 'rec-2',
    description: 'ביטוח',
    amount_agorot: -12000,
    frequency: 'monthly',
    next_due_date: '2026-09-05',
    is_active: true,
  },
]
const mockUseRecurringTransactions = jest.fn()
jest.mock('@/features/recurring/hooks/useRecurringTransactions', () => ({
  useRecurringTransactions: () => mockUseRecurringTransactions(),
}))

// Real usePriceIncreaseDetections chains into useTransactions -> the real
// Supabase client module, which throws at import time in this test
// environment (no EXPO_PUBLIC_SUPABASE_* env vars set — same reasoning as
// every other hook this screen test mocks). Defaults to "no detections";
// individual tests override via mockReturnValue.
const mockUsePriceIncreaseDetections = jest.fn<
  () => { detections: Record<string, unknown>[]; isLoading: boolean; error: Error | null }
>(() => ({ detections: [], isLoading: false, error: null }))
jest.mock('@/features/recurring/hooks/usePriceIncreaseDetections', () => ({
  usePriceIncreaseDetections: () => mockUsePriceIncreaseDetections(),
}))

const PRICE_INCREASE_DETECTION = {
  identityKey: 'recurring:rec-1',
  recurringId: 'rec-1',
  description: 'Netflix',
  previousAmountAgorot: 7990,
  currentAmountAgorot: 8990,
  increaseAgorot: 1000,
  increasePercent: 12.5,
  detectedAt: '2026-08-01',
  currentTransactionId: 'txn-1',
}

describe('Recurring list', () => {
  beforeEach(() => {
    mockUsePriceIncreaseDetections.mockReturnValue({ detections: [], isLoading: false, error: null })
  })

  it('reverses the desktop 2-column recurring grid so the first item renders on the right', async () => {
    mockUseRecurringTransactions.mockReturnValue({ recurringTransactions: RECURRING, isLoading: false, error: null })

    const { getByText } = await render(<Recurring />)

    let node = getByText('שכירות').parent
    while (node && !(node.props.className as string | undefined)?.includes('w-[48%]')) {
      node = node.parent
    }
    const gridContainer = node?.parent
    expect(gridContainer?.props.className as string).toContain('web:desktop:flex-row')
  })

  // UX-completeness audit P2 fix: a paused (is_active: false) card rendered
  // with the exact same styling as an active one, indistinguishable at a
  // glance beyond a status badge. Mobile redesign: the plain "· מושהה" text
  // suffix became a StatusChip, matching every other status readout in the
  // app (never color alone — see StatusChip.tsx's own header comment).
  it('gives a paused template a visually muted card and an inactive status chip, leaving an active one untouched', async () => {
    mockUseRecurringTransactions.mockReturnValue({
      recurringTransactions: [{ ...RECURRING[0], id: 'rec-1', is_active: false }, RECURRING[1]],
      isLoading: false,
      error: null,
    })

    const { getByText } = await render(<Recurring />)

    expect(getByText('מושהה')).toBeTruthy()

    let pausedCard = getByText('שכירות').parent
    while (pausedCard && !(pausedCard.props.className as string | undefined)?.includes('opacity-60')) {
      pausedCard = pausedCard.parent
    }
    expect(pausedCard).toBeTruthy()

    let activeCard = getByText('ביטוח').parent
    while (activeCard && !(activeCard.props.className as string | undefined)?.includes('rounded-card')) {
      activeCard = activeCard.parent
    }
    expect(activeCard).toBeTruthy()
    expect(activeCard?.props.className as string).not.toContain('opacity-60')
  })

  it('renders a detected price increase with previous/current amounts and percent', async () => {
    mockUseRecurringTransactions.mockReturnValue({ recurringTransactions: RECURRING, isLoading: false, error: null })
    mockUsePriceIncreaseDetections.mockReturnValue({ detections: [PRICE_INCREASE_DETECTION], isLoading: false, error: null })

    const { getByText } = await render(<Recurring />)

    // Amount/percent lines interpolate formatILS, whose he-IL Intl output
    // carries locale-dependent bidi control characters (see
    // lib/money/format.test.ts's own header comment) — match on the
    // digits/symbol substrings actually promised via a non-anchored regex,
    // not byte-for-byte equality with the whole rendered string.
    expect(getByText('עליות מחיר שזוהו')).toBeTruthy()
    expect(getByText('המחיר עלה')).toBeTruthy()
    expect(getByText(/79\.90.*→.*89\.90/)).toBeTruthy()
    expect(getByText(/עלייה של.*10\.00.*12\.5%/)).toBeTruthy()
  })

  it('does not render the price-increase section when there are no detections', async () => {
    mockUseRecurringTransactions.mockReturnValue({ recurringTransactions: RECURRING, isLoading: false, error: null })
    mockUsePriceIncreaseDetections.mockReturnValue({ detections: [], isLoading: false, error: null })

    const { queryByText } = await render(<Recurring />)

    expect(queryByText('עליות מחיר שזוהו')).toBeNull()
    expect(queryByText('המחיר עלה')).toBeNull()
  })
})
