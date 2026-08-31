import { describe, expect, it } from '@jest/globals'
import { assembleForecastInputs } from './assembleForecastInputs'
import type { Account, InstallmentPlan, PlannedObligation, RecurringTransaction } from '@/types/app'

const account = (overrides: Partial<Account> = {}): Account =>
  ({
    id: 'acc-1',
    household_id: 'hh-1',
    owner_id: null,
    name: 'עו״ש',
    type: 'checking',
    currency: 'ILS',
    balance_agorot: 0,
    color: null,
    icon: null,
    is_active: true,
    include_in_total: true,
    billing_cycle_day: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }) as Account

const obligation = (overrides: Partial<PlannedObligation> = {}): PlannedObligation =>
  ({
    id: 'ob-1',
    household_id: 'hh-1',
    name: 'ארנונה',
    amount_agorot: 10_000,
    due_date: '2026-09-01',
    status: 'upcoming',
    category_id: null,
    account_id: null,
    is_shared: true,
    notes: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    version: 1,
    created_by: 'user-1',
    completed_transaction_id: null,
    ...overrides,
  }) as PlannedObligation

const recurring = (overrides: Partial<RecurringTransaction> = {}): RecurringTransaction =>
  ({
    id: 'rc-1',
    household_id: 'hh-1',
    description: 'משכנתא',
    amount_agorot: -50_000,
    frequency: 'monthly',
    day_of_month: 10,
    next_due_date: '2026-09-10',
    is_active: true,
    category_id: null,
    account_id: null,
    is_shared: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    version: 1,
    created_by: 'user-1',
    last_generated_date: null,
    ...overrides,
  }) as RecurringTransaction

const installmentPlan = (overrides: Partial<InstallmentPlan> = {}): InstallmentPlan =>
  ({
    id: 'ip-1',
    household_id: 'hh-1',
    description: 'ספה',
    total_agorot: 120_000,
    installment_count: 12,
    monthly_agorot: 10_000,
    first_charge_date: '2026-01-10',
    category_id: null,
    account_id: null,
    is_shared: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    version: 1,
    created_by: 'user-1',
    merchant: null,
    purchase_date: '2026-01-08',
    ...overrides,
  }) as InstallmentPlan

describe('assembleForecastInputs', () => {
  it('sums only eligible cash accounts into availableCashAgorot', () => {
    const result = assembleForecastInputs({
      accounts: [
        account({ id: 'acc-bank', type: 'checking' }),
        account({ id: 'acc-cash', type: 'cash' }),
        account({ id: 'acc-card', type: 'credit_card' }),
        account({ id: 'acc-savings', type: 'savings' }),
      ],
      balances: { 'acc-bank': 500_000, 'acc-cash': 20_000, 'acc-card': -30_000, 'acc-savings': 1_000_000 },
      obligations: [],
      recurringTransactions: [],
      installmentPlans: [],
      materializedCounts: {},
    })
    expect(result.availableCashAgorot).toBe(520_000)
  })

  it('maps obligation snake_case fields to the engine input shape', () => {
    const result = assembleForecastInputs({
      accounts: [],
      balances: {},
      obligations: [obligation({ id: 'ob-x', name: 'ביטוח', amount_agorot: 12_345, due_date: '2026-10-01', status: 'upcoming' })],
      recurringTransactions: [],
      installmentPlans: [],
      materializedCounts: {},
    })
    expect(result.obligations).toEqual([
      { id: 'ob-x', name: 'ביטוח', amountAgorot: 12_345, dueDate: '2026-10-01', status: 'upcoming', categoryId: null, accountId: null },
    ])
  })

  it('maps recurring snake_case fields to the engine input shape', () => {
    const result = assembleForecastInputs({
      accounts: [],
      balances: {},
      obligations: [],
      recurringTransactions: [recurring({ id: 'rc-x', description: 'חדר כושר', amount_agorot: -9_900, day_of_month: 15 })],
      installmentPlans: [],
      materializedCounts: {},
    })
    expect(result.recurringTemplates).toEqual([
      {
        id: 'rc-x',
        description: 'חדר כושר',
        amountAgorot: -9_900,
        frequency: 'monthly',
        dayOfMonth: 15,
        nextDueDate: '2026-09-10',
        isActive: true,
        categoryId: null,
        accountId: null,
      },
    ])
  })

  it('maps installment plan fields and resolves materializedCount from the counts map, defaulting to 0', () => {
    const result = assembleForecastInputs({
      accounts: [],
      balances: {},
      obligations: [],
      recurringTransactions: [],
      installmentPlans: [installmentPlan({ id: 'ip-x' }), installmentPlan({ id: 'ip-y' })],
      materializedCounts: { 'ip-x': 5 },
    })
    expect(result.installmentPlans.find((p) => p.id === 'ip-x')?.materializedCount).toBe(5)
    expect(result.installmentPlans.find((p) => p.id === 'ip-y')?.materializedCount).toBe(0)
  })
})
