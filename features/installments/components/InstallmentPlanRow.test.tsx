// A plan's schedule dates have to come from the generator's own month
// arithmetic, or a row can name a date no transaction will ever land on.

import { describe, expect, it, jest } from '@jest/globals'
import { render } from '@testing-library/react-native'
import i18n from '@/i18n'
import { InstallmentPlanRow } from './InstallmentPlanRow'
import { formatILS } from '@/lib/money/format'
import type { InstallmentPlan } from '@/types/app'

jest.mock('nativewind', () => ({ useColorScheme: () => ({ colorScheme: 'light' }) }))
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }))

const PLAN: InstallmentPlan = {
  id: 'ip-1',
  household_id: 'h1',
  account_id: 'acc-card',
  category_id: null,
  merchant_name: 'מחסני רהיטים',
  description: 'ספה, מחסני רהיטים',
  total_agorot: 718_800,
  installment_count: 12,
  monthly_agorot: 59_900,
  first_charge_date: '2026-04-10',
  is_shared: true,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  created_by: 'u1',
  version: 1,
}

describe('InstallmentPlanRow', () => {
  it('names the next and last charge dates from the plan’s own first charge', async () => {
    // 5 paid -> next is instalment 6, at first_charge + 5 months; last is
    // instalment 12, at first_charge + 11 months.
    const { getByText } = await render(<InstallmentPlanRow plan={PLAN} paidCount={5} variant="row" />)

    expect(
      getByText(
        i18n.t('installments.scheduleLine', { index: 6, total: 12, next: '10.09.2026', last: '10.03.2027' })
      )
    ).toBeTruthy()
  })

  it('subtracts only what has actually been charged from the remaining balance', async () => {
    const { getByText } = await render(<InstallmentPlanRow plan={PLAN} paidCount={5} variant="row" />)
    expect(getByText(formatILS(718_800 - 59_900 * 5))).toBeTruthy()
  })

  it('says the plan is finished rather than naming a next charge that will never come', async () => {
    const { getByText } = await render(<InstallmentPlanRow plan={PLAN} paidCount={12} variant="row" />)
    expect(getByText(i18n.t('installments.finishedLine', { total: 12, last: '10.03.2027' }))).toBeTruthy()
  })

  it('never counts more instalments as paid than the plan has', async () => {
    // A materialized count above the plan's own length would otherwise
    // produce a negative remaining balance and a nonsense next date.
    const { getByText } = await render(<InstallmentPlanRow plan={PLAN} paidCount={40} variant="row" />)
    expect(getByText(formatILS(0))).toBeTruthy()
  })

  it('leads the phone card with how many payments are left', async () => {
    const { getByText } = await render(<InstallmentPlanRow plan={PLAN} paidCount={5} />)
    expect(getByText(i18n.t('installments.remainingCount', { count: 7, date: '10.03.2027' }))).toBeTruthy()
  })

  it('marks a personal plan, so a shared list does not imply shared money', async () => {
    const { getByText } = await render(
      <InstallmentPlanRow plan={{ ...PLAN, is_shared: false }} paidCount={1} />
    )
    expect(getByText(i18n.t('transactions.form.personal'))).toBeTruthy()
  })
})
