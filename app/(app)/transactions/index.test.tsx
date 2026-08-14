// Design Phase 3: first test coverage for the Transactions list screen
// (none existed before this phase). Covers the empty state and populated
// row rendering — description, category name, and sign-aware amount color
// class, matching Dashboard's Recent Transactions row convention.
import { describe, expect, it, jest } from '@jest/globals'
import { render } from '@testing-library/react-native'
import '@/i18n'
import Transactions from './index'
import { formatILS } from '@/lib/money/format'

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
}))
// Avoids a deep, environment-specific import chain
// (@expo/vector-icons -> expo-font -> expo-asset) unrelated to what this
// test verifies — same rationale as other screen tests in this repo.
jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}))
jest.mock('@/features/auth/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}))
jest.mock('@/features/household/hooks/useHousehold', () => ({
  useHousehold: () => ({ householdId: 'household-1', isLoading: false }),
}))
jest.mock('@/features/categories/hooks/useCategories', () => ({
  useCategories: () => ({ categories: [{ id: 'cat-1', name_he: 'מזון', icon: '🍔' }] }),
}))

const mockUseTransactions = jest.fn()
jest.mock('@/features/transactions/hooks/useTransactions', () => ({
  useTransactions: () => mockUseTransactions(),
}))

// Climbs from a node up to the nearest ancestor whose className contains
// `marker`, rather than a fixed number of `.parent` hops — resilient to the
// exact wrapper nesting between the queried text and the element under test.
function climbTo(node: any, marker: string) {
  let current = node
  while (current && !((current.props?.className as string | undefined) ?? '').includes(marker)) {
    current = current.parent
  }
  return current
}

describe('Transactions list', () => {
  it('shows the empty message and exactly one add-transaction CTA (the floating action, not a duplicate button)', async () => {
    mockUseTransactions.mockReturnValue({ transactions: [], isLoading: false, error: null })

    const { getAllByText, getByLabelText, queryAllByText } = await render(<Transactions />)

    // Desktop polish pass (round 2): the empty state now renders twice —
    // a compact mobile version and a full-size desktop version, toggled by
    // `web:desktop:hidden` / `hidden web:desktop:flex` wrappers RNTL can't
    // evaluate as real CSS — so both copies of the message legitimately
    // exist in the tree at once.
    expect(getAllByText('עדיין אין תנועות. הוסיפו את הראשונה שלכם.').length).toBe(2)
    // Phase 3.1: the empty state's own actionLabel button was removed — the
    // screen's floatingAction FAB is the one "add transaction" CTA now, so
    // its accessible label is the only place this text should appear (no
    // visible "הוספת תנועה" Text/Button left in the empty-state itself).
    expect(getByLabelText('הוספת תנועה')).toBeTruthy()
    expect(queryAllByText('הוספת תנועה')).toHaveLength(0)
  })

  // Desktop polish pass (round 2): a real-browser visual check at a
  // realistic ~900px viewport height found the earlier "bounded region
  // near the top" treatment still read as a small card floating in mostly
  // empty page — `web:desktop:flex-1 web:desktop:justify-center` claims
  // the column's remaining vertical space (Screen's own content column is
  // already `flex-1`, see Screen.tsx) and centers the card within it
  // instead of leaving that space as dead canvas below a top-anchored box.
  // Mobile keeps the exact original unscoped "items-center pt-10" box —
  // asserted below by confirming the bare (non-`web:desktop:`-prefixed)
  // tokens contain no `flex-1`/`justify-center` of their own.
  it("gives the desktop empty state the column's remaining space, centered, instead of a small top-anchored box", async () => {
    mockUseTransactions.mockReturnValue({ transactions: [], isLoading: false, error: null })

    const { getAllByText } = await render(<Transactions />)

    const card = climbTo(getAllByText('עדיין אין תנועות. הוסיפו את הראשונה שלכם.')[0], 'max-w-[520px]')
    const cardClassName = card?.props.className as string
    expect(cardClassName).toContain('web:desktop:max-w-[520px]')
    expect(cardClassName).toContain('web:desktop:rounded-card')
    expect(cardClassName).toContain('web:desktop:border')

    const outerBox = card?.parent
    const outerTokens = ((outerBox?.props.className as string) ?? '').split(/\s+/)
    expect(outerTokens).toContain('items-center')
    expect(outerTokens).toContain('pt-10')
    expect(outerTokens).not.toContain('flex-1')
    expect(outerTokens).not.toContain('justify-center')
    expect(outerTokens).toContain('web:desktop:flex-1')
    expect(outerTokens).toContain('web:desktop:justify-center')
  })

  // Desktop polish pass (round 2): `compact` has no responsive variant, so
  // the desktop card renders a second, full-size EmptyState instead of
  // reusing the mobile compact one — guards that each variant is correctly
  // shown/hidden per breakpoint rather than both showing at once on either.
  it('shows the compact empty state only off desktop, and the full-size one only at desktop', async () => {
    mockUseTransactions.mockReturnValue({ transactions: [], isLoading: false, error: null })

    const { getAllByText } = await render(<Transactions />)

    const [mobileMessage, desktopMessage] = getAllByText('עדיין אין תנועות. הוסיפו את הראשונה שלכם.')
    const mobileWrapper = climbTo(mobileMessage, 'web:desktop:hidden')
    const desktopWrapper = climbTo(desktopMessage, 'web:desktop:flex')
    const mobileTokens = ((mobileWrapper?.props.className as string) ?? '').split(/\s+/)
    const desktopTokens = ((desktopWrapper?.props.className as string) ?? '').split(/\s+/)
    expect(mobileTokens).toContain('web:desktop:hidden')
    expect(mobileTokens).not.toContain('hidden')
    expect(desktopTokens).toContain('hidden')
    expect(desktopTokens).toContain('web:desktop:flex')
  })

  it('renders a populated row with description, category name, and a positive-colored income amount', async () => {
    mockUseTransactions.mockReturnValue({
      transactions: [
        {
          id: 'txn-1',
          category_id: 'cat-1',
          description: 'משכורת',
          amount_agorot: 500000,
          txn_date: '2026-08-01',
          is_shared: true,
          is_excluded: false,
        },
      ],
      isLoading: false,
      error: null,
    })

    const { getByText } = await render(<Transactions />)

    expect(getByText('משכורת')).toBeTruthy()
    const amount = getByText(formatILS(500000))
    expect(amount.props.className).toContain('text-positive-light')
    expect(amount.props.className).toContain('dark:text-positive-dark')
  })

  // Desktop/RTL polish pass (real-browser regression): the title+CSV-import
  // header was a plain flex-row, which native auto-mirrors via Yoga under
  // the forced-RTL flag but NativeWind's web-compiled CSS does not — a
  // headless-browser measurement found the title rendering on the physical
  // left on web (should be right, since it's listed first/primary).
  it('reverses the title/CSV-import header row on web so the title renders on the right', async () => {
    mockUseTransactions.mockReturnValue({ transactions: [], isLoading: false, error: null })

    const { getByText } = await render(<Transactions />)

    const header = getByText('תנועות').parent
    expect(header?.props.className as string).toContain('web:flex-row-reverse')
  })

  // Desktop polish pass: a simple 3-column row list (icon, description,
  // amount) stretched to the `wide` (1150px desktop) content cap read as
  // absurdly wide rows — narrowed to `medium` (flat 800px), matching the
  // "simple list screens ~760-1000px" desktop guideline.
  it('caps the desktop content width at the medium (800px) token, not the wide (1150px) one', async () => {
    mockUseTransactions.mockReturnValue({ transactions: [], isLoading: false, error: null })

    const { getByText } = await render(<Transactions />)

    const contentColumn = getByText('תנועות').parent?.parent
    const className = contentColumn?.props.className as string
    expect(className).toContain('web:tablet:max-w-[800px]')
    expect(className).not.toContain('web:desktop:max-w-[1150px]')
  })

  it('gives an expense a neutral (non-positive) amount color, not accent', async () => {
    mockUseTransactions.mockReturnValue({
      transactions: [
        {
          id: 'txn-2',
          category_id: null,
          description: 'קניות בסופר',
          amount_agorot: -5000,
          txn_date: '2026-08-02',
          is_shared: true,
          is_excluded: false,
        },
      ],
      isLoading: false,
      error: null,
    })

    const { getByText } = await render(<Transactions />)

    const amount = getByText(formatILS(-5000))
    expect(amount.props.className).toContain('text-ink-light')
    expect(amount.props.className).not.toContain('positive')
  })
})
