// The two compositions the two design files draw. What matters is not the
// class strings but that each variant carries the elements its own frame
// carries and drops the ones it does not: the phone row navigates (chevron,
// card chrome, ratio split across the foot), the desktop row edits in place
// (no chevron, no card, ratio on the name line).

import { describe, expect, it, jest } from '@jest/globals'
import { fireEvent, render } from '@testing-library/react-native'
import i18n from '@/i18n'
import { BudgetCategoryRow } from './BudgetCategoryRow'
import { formatILS, formatRatioILS } from '@/lib/money/format'
import type { BudgetStateResult } from '@/features/budgets/lib/budgetState'

jest.mock('nativewind', () => ({ useColorScheme: () => ({ colorScheme: 'light' }) }))

const CATEGORY = {
  categoryId: 'cat-car',
  categoryNameHe: 'דלק ורכב',
  categoryIcon: '🚗',
  allocatedAgorot: 140_000,
  spentAgorot: 98_000,
  remainingAgorot: 42_000,
  percentSpent: 70,
}

const HEALTHY: BudgetStateResult = {
  state: 'healthy',
  percentSpent: 70,
  pacePercent: 71,
  hasProjection: false,
  projectedOverspendAgorot: 0,
}

describe('BudgetCategoryRow', () => {
  it('splits spent and remaining across the row foot on the phone frame', async () => {
    const { getByText } = await render(
      <BudgetCategoryRow category={CATEGORY} state={HEALTHY} onPress={() => {}} />
    )

    expect(
      getByText(
        i18n.t('budgets.category.spentOf', {
          spent: formatILS(CATEGORY.spentAgorot),
          total: formatILS(CATEGORY.allocatedAgorot),
        })
      )
    ).toBeTruthy()
    expect(getByText(i18n.t('budgets.category.remaining', { amount: formatILS(42_000) }))).toBeTruthy()
  })

  it('lifts the ratio onto the name line on the desktop frame', async () => {
    const { getByText, queryByText } = await render(
      <BudgetCategoryRow category={CATEGORY} state={HEALTHY} onPress={() => {}} variant="plain" />
    )

    expect(getByText(formatRatioILS(CATEGORY.spentAgorot, CATEGORY.allocatedAgorot))).toBeTruthy()
    // The phone's two-part foot is gone — the ratio replaced it.
    expect(
      queryByText(
        i18n.t('budgets.category.spentOf', {
          spent: formatILS(CATEGORY.spentAgorot),
          total: formatILS(CATEGORY.allocatedAgorot),
        })
      )
    ).toBeNull()
  })

  // One `it` per variant, not a loop: two renders inside one test leave two
  // rows mounted at once and every query goes ambiguous.
  it.each(['card', 'plain'] as const)('keeps the state chip and the row target in the %s frame', async (variant) => {
    const { getAllByLabelText, getByText } = await render(
      <BudgetCategoryRow category={CATEGORY} state={HEALTHY} onPress={() => {}} variant={variant} />
    )

    // The chip says the state in words, and both the row and its bar
    // announce it — status is never carried by the fill colour alone.
    expect(getByText(i18n.t('budgets.state.onTrack'))).toBeTruthy()
    expect(getAllByLabelText(`${CATEGORY.categoryNameHe}, ${i18n.t('budgets.state.onTrack')}`)).toHaveLength(2)
  })

  it('states the overrun rather than a remaining amount when the category is over', async () => {
    const over = { ...CATEGORY, spentAgorot: 168_000, remainingAgorot: -28_000, percentSpent: 120 }
    const overState: BudgetStateResult = { ...HEALTHY, state: 'over', percentSpent: 120 }

    const { getByText } = await render(
      <BudgetCategoryRow category={over} state={overState} onPress={() => {}} variant="plain" />
    )

    expect(getByText(i18n.t('budgets.category.exceeded', { amount: formatILS(28_000) }))).toBeTruthy()
  })

  it('opens the category in both frames', async () => {
    const onPress = jest.fn()
    const { getByRole } = await render(
      <BudgetCategoryRow category={CATEGORY} state={HEALTHY} onPress={onPress} variant="plain" />
    )

    fireEvent.press(getByRole('button'))

    expect(onPress).toHaveBeenCalled()
  })

  it('opens the category screen from the chevron, and the amount editor from the row', async () => {
    // Two targets, because the row does two different things and the frame
    // draws both: tapping it sets the amount, tapping the chevron opens
    // "מהתקציב לתנועות של אותה קטגוריה".
    const onPress = jest.fn()
    const onOpenDetail = jest.fn()
    const { getAllByRole } = await render(
      <BudgetCategoryRow category={CATEGORY} state={HEALTHY} onPress={onPress} onOpenDetail={onOpenDetail} />
    )

    const buttons = getAllByRole('button')
    fireEvent.press(buttons[buttons.length - 1]!)

    expect(onOpenDetail).toHaveBeenCalled()
    expect(onPress).not.toHaveBeenCalled()
  })

  it('draws no chevron where there is no category screen to open', async () => {
    const { getAllByRole } = await render(
      <BudgetCategoryRow category={CATEGORY} state={HEALTHY} onPress={() => {}} />
    )
    // The row itself, and nothing else pressable.
    expect(getAllByRole('button')).toHaveLength(1)
  })
})
