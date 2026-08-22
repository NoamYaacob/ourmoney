import { describe, expect, it } from '@jest/globals'
import { buildFinancialAlerts, type BuildFinancialAlertsInput, type SavingsGoalAlertInput } from './buildFinancialAlerts'
import type { CashFlowForecastResult } from '../cashflow/calculateCashFlowForecast'
import type { PlannedObligationForecastInput } from '../cashflow/calculateSafeToSpend'
import type { PriceIncreaseDetection } from '@/features/recurring/lib/priceIncreaseDetection'
import type { CreditCardCycleAccountInput } from './detectHighCreditCardCycleSpend'
import type { BudgetCategoryProgress } from '@/types/app'

const TODAY = '2026-08-16'

function forecast(overrides: Partial<CashFlowForecastResult> = {}): CashFlowForecastResult {
  return {
    startingBalanceAgorot: 500000,
    endingBalanceAgorot: 500000,
    totalInflowsAgorot: 0,
    totalOutflowsAgorot: 0,
    lowestBalanceAgorot: 500000,
    lowestBalanceDate: TODAY,
    firstShortfallDate: null,
    upcomingObligationsCount: 0,
    events: [],
    dailyPoints: [],
    ...overrides,
  }
}

function obligation(overrides: Partial<PlannedObligationForecastInput> = {}): PlannedObligationForecastInput {
  return {
    id: 'ob-1',
    name: 'ארנונה',
    amountAgorot: 47500,
    dueDate: '2026-08-20',
    status: 'upcoming',
    categoryId: null,
    accountId: null,
    ...overrides,
  }
}

function priceIncrease(overrides: Partial<PriceIncreaseDetection> = {}): PriceIncreaseDetection {
  return {
    identityKey: 'recurring:rec-1',
    recurringId: 'rec-1',
    description: 'אינטרנט',
    previousAmountAgorot: 9900,
    currentAmountAgorot: 11900,
    increaseAgorot: 2000,
    increasePercent: 20.2,
    detectedAt: '2026-08-01',
    currentTransactionId: 'txn-1',
    ...overrides,
  }
}

function budgetCategory(overrides: Partial<BudgetCategoryProgress> = {}): BudgetCategoryProgress {
  return {
    categoryId: 'cat-1',
    categoryNameHe: 'מכולת',
    categoryIcon: '🛒',
    allocatedAgorot: 100000,
    spentAgorot: 50000,
    remainingAgorot: 50000,
    percentSpent: 50,
    ...overrides,
  }
}

function baseInput(overrides: Partial<BuildFinancialAlertsInput> = {}): BuildFinancialAlertsInput {
  return {
    today: TODAY,
    forecast: null,
    obligations: [],
    priceIncreaseDetections: [],
    budgetCategories: [],
    creditCardCycles: [],
    categorySpend: null,
    savingsGoals: [],
    safeToSpendAgorot: null,
    ...overrides,
  }
}

function creditCardCycleAccount(
  overrides: Partial<CreditCardCycleAccountInput> = {}
): CreditCardCycleAccountInput {
  return {
    accountId: 'acc-cc-1',
    accountName: 'ויזה',
    billingCycleDay: 10,
    transactions: [],
    ...overrides,
  }
}

function savingsGoal(overrides: Partial<SavingsGoalAlertInput> = {}): SavingsGoalAlertInput {
  return {
    id: 'goal-1',
    name: 'קרן חירום',
    currentAgorot: 100000,
    targetAgorot: 500000,
    targetDate: null,
    ...overrides,
  }
}

describe('buildFinancialAlerts', () => {
  it('returns no alerts when nothing meets any threshold', () => {
    expect(buildFinancialAlerts(baseInput())).toEqual([])
  })

  it('produces a critical alert for an overdue obligation', () => {
    const alerts = buildFinancialAlerts(baseInput({ obligations: [obligation({ dueDate: '2026-08-10' })] }))
    expect(alerts).toHaveLength(1)
    expect(alerts[0]?.severity).toBe('critical')
    expect(alerts[0]?.type).toBe('upcoming_obligation')
  })

  it('produces a warning alert for an obligation due today', () => {
    const alerts = buildFinancialAlerts(baseInput({ obligations: [obligation({ dueDate: TODAY })] }))
    expect(alerts[0]?.severity).toBe('warning')
  })

  it('produces a warning alert for an obligation due in 3 days', () => {
    const alerts = buildFinancialAlerts(baseInput({ obligations: [obligation({ dueDate: '2026-08-19' })] }))
    expect(alerts[0]?.severity).toBe('warning')
  })

  it('produces an info alert for an obligation due in 7 days', () => {
    const alerts = buildFinancialAlerts(baseInput({ obligations: [obligation({ dueDate: '2026-08-23' })] }))
    expect(alerts[0]?.severity).toBe('info')
  })

  it('produces no alert for an obligation due beyond 7 days', () => {
    const alerts = buildFinancialAlerts(baseInput({ obligations: [obligation({ dueDate: '2026-08-24' })] }))
    expect(alerts).toEqual([])
  })

  it('ignores a completed obligation entirely', () => {
    const alerts = buildFinancialAlerts(baseInput({ obligations: [obligation({ status: 'completed', dueDate: '2026-08-10' })] }))
    expect(alerts).toEqual([])
  })

  it('ignores a cancelled obligation entirely', () => {
    const alerts = buildFinancialAlerts(baseInput({ obligations: [obligation({ status: 'cancelled', dueDate: '2026-08-10' })] }))
    expect(alerts).toEqual([])
  })

  it('produces a critical forecast-shortfall alert within 3 days', () => {
    const alerts = buildFinancialAlerts(
      baseInput({ forecast: forecast({ firstShortfallDate: '2026-08-18', lowestBalanceAgorot: -12400 }) })
    )
    expect(alerts).toHaveLength(1)
    expect(alerts[0]?.type).toBe('forecast_shortfall')
    expect(alerts[0]?.severity).toBe('critical')
    expect(alerts[0]?.amountAgorot).toBe(12400)
  })

  it('reports the balance on firstShortfallDate itself, not the horizon-wide lowest balance', () => {
    // A small early dip (day of firstShortfallDate) that recovers, followed
    // by a much deeper dip later in the horizon (e.g. an annual payment).
    // The alert must report the FIRST day's own deficit (1000), never the
    // horizon-wide lowestBalanceAgorot (50000) from the later, unrelated day.
    const alerts = buildFinancialAlerts(
      baseInput({
        forecast: forecast({
          firstShortfallDate: '2026-08-18',
          lowestBalanceAgorot: -50000,
          lowestBalanceDate: '2026-09-10',
          dailyPoints: [
            { date: '2026-08-17', balanceAgorot: 500, inflowsAgorot: 0, outflowsAgorot: 0 },
            { date: '2026-08-18', balanceAgorot: -1000, inflowsAgorot: 0, outflowsAgorot: 1500 },
            { date: '2026-08-19', balanceAgorot: 200, inflowsAgorot: 1200, outflowsAgorot: 0 },
            { date: '2026-09-10', balanceAgorot: -50000, inflowsAgorot: 0, outflowsAgorot: 50200 },
          ],
        }),
      })
    )
    expect(alerts).toHaveLength(1)
    expect(alerts[0]?.type).toBe('forecast_shortfall')
    expect(alerts[0]?.date).toBe('2026-08-18')
    expect(alerts[0]?.amountAgorot).toBe(1000)
  })

  it('produces a warning forecast-shortfall alert 4-14 days out', () => {
    const alerts = buildFinancialAlerts(
      baseInput({ forecast: forecast({ firstShortfallDate: '2026-08-25', lowestBalanceAgorot: -5000 }) })
    )
    expect(alerts[0]?.severity).toBe('warning')
  })

  it('produces no alert when the forecast has no shortfall', () => {
    const alerts = buildFinancialAlerts(baseInput({ forecast: forecast({ firstShortfallDate: null }) }))
    expect(alerts).toEqual([])
  })

  it('produces no alert when the forecast is unavailable (null, e.g. that source errored)', () => {
    const alerts = buildFinancialAlerts(baseInput({ forecast: null }))
    expect(alerts).toEqual([])
  })

  it('produces a recurring price-increase alert from an existing detection', () => {
    const alerts = buildFinancialAlerts(baseInput({ priceIncreaseDetections: [priceIncrease()] }))
    expect(alerts).toHaveLength(1)
    expect(alerts[0]?.type).toBe('recurring_price_increase')
    expect(alerts[0]?.severity).toBe('warning')
    expect(alerts[0]?.amountAgorot).toBe(2000)
  })

  it('produces no price-increase alert when there are no detections (a stable recurring price)', () => {
    const alerts = buildFinancialAlerts(baseInput({ priceIncreaseDetections: [] }))
    expect(alerts).toEqual([])
  })

  it('produces no budget alert at 79%', () => {
    const alerts = buildFinancialAlerts(baseInput({ budgetCategories: [budgetCategory({ percentSpent: 79 })] }))
    expect(alerts).toEqual([])
  })

  it('produces a warning budget alert at 80%', () => {
    const alerts = buildFinancialAlerts(baseInput({ budgetCategories: [budgetCategory({ percentSpent: 80 })] }))
    expect(alerts[0]?.type).toBe('budget_risk')
    expect(alerts[0]?.severity).toBe('warning')
  })

  it('produces a stronger (critical) budget alert above 100%', () => {
    const alerts = buildFinancialAlerts(baseInput({ budgetCategories: [budgetCategory({ percentSpent: 115 })] }))
    expect(alerts[0]?.severity).toBe('critical')
  })

  it('produces deterministic ids: same input twice produces identical ids', () => {
    const input = baseInput({
      obligations: [obligation()],
      priceIncreaseDetections: [priceIncrease()],
      budgetCategories: [budgetCategory({ percentSpent: 90 })],
    })
    const first = buildFinancialAlerts(input).map((a) => a.id)
    const second = buildFinancialAlerts(input).map((a) => a.id)
    expect(first).toEqual(second)
  })

  it('produces exactly one alert per obligation, never a separate overdue+upcoming pair for the same obligation', () => {
    const alerts = buildFinancialAlerts(baseInput({ obligations: [obligation({ dueDate: '2026-08-01' })] }))
    expect(alerts.filter((a) => a.sourceId === 'ob-1')).toHaveLength(1)
  })

  it('produces exactly one alert per over-threshold budget category, never two for both 80% and 100%', () => {
    const alerts = buildFinancialAlerts(baseInput({ budgetCategories: [budgetCategory({ percentSpent: 120 })] }))
    expect(alerts.filter((a) => a.sourceId === 'cat-1')).toHaveLength(1)
    expect(alerts[0]?.severity).toBe('critical')
  })

  it('never produces duplicate alert ids across two different independent sources', () => {
    const alerts = buildFinancialAlerts(
      baseInput({
        obligations: [obligation({ id: 'ob-1' }), obligation({ id: 'ob-2', dueDate: TODAY })],
        priceIncreaseDetections: [priceIncrease({ identityKey: 'recurring:rec-1' })],
        budgetCategories: [budgetCategory({ categoryId: 'cat-1', percentSpent: 90 })],
      })
    )
    const ids = alerts.map((a) => a.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('the four alert-type id prefixes can never collide with each other, even with matching sourceIds', () => {
    // Deliberately reuse the SAME literal string as an obligation id, a
    // recurring identityKey, and a category id — if the prefixes weren't
    // disjoint, these would collide into fewer than 3 alerts (plus the
    // always-present forecast_shortfall alert = 4 total).
    const sharedId = 'shared-id'
    const alerts = buildFinancialAlerts(
      baseInput({
        forecast: forecast({ firstShortfallDate: '2026-08-18', lowestBalanceAgorot: -1000 }),
        obligations: [obligation({ id: sharedId, dueDate: '2026-08-18' })],
        priceIncreaseDetections: [priceIncrease({ identityKey: sharedId })],
        budgetCategories: [budgetCategory({ categoryId: sharedId, percentSpent: 90 })],
      })
    )
    const ids = alerts.map((a) => a.id)
    expect(new Set(ids).size).toBe(4)
    expect(alerts).toHaveLength(4)
  })

  it('sorts by severity first: critical before warning before info', () => {
    const alerts = buildFinancialAlerts(
      baseInput({
        obligations: [obligation({ id: 'ob-info', dueDate: '2026-08-22' })], // info
        priceIncreaseDetections: [priceIncrease()], // warning
        forecast: forecast({ firstShortfallDate: '2026-08-17', lowestBalanceAgorot: -1000 }), // critical
      })
    )
    expect(alerts.map((a) => a.severity)).toEqual(['critical', 'warning', 'info'])
  })

  it('sorts by date within the same severity tier, soonest first', () => {
    const alerts = buildFinancialAlerts(
      baseInput({
        obligations: [
          obligation({ id: 'ob-later', dueDate: '2026-08-19' }),
          obligation({ id: 'ob-sooner', dueDate: TODAY }),
        ],
      })
    )
    expect(alerts.every((a) => a.severity === 'warning')).toBe(true)
    expect(alerts.map((a) => a.sourceId)).toEqual(['ob-sooner', 'ob-later'])
  })

  it('sorts an undated alert (budget_risk) after dated alerts within the same severity tier', () => {
    const alerts = buildFinancialAlerts(
      baseInput({
        obligations: [obligation({ dueDate: TODAY })], // warning, dated
        budgetCategories: [budgetCategory({ percentSpent: 85 })], // warning, undated
      })
    )
    expect(alerts.map((a) => a.type)).toEqual(['upcoming_obligation', 'budget_risk'])
  })

  it('combines all four sources into one correctly-populated, correctly-ordered list', () => {
    const alerts = buildFinancialAlerts(
      baseInput({
        forecast: forecast({ firstShortfallDate: '2026-08-18', lowestBalanceAgorot: -12400 }),
        obligations: [obligation({ dueDate: '2026-08-20' })],
        priceIncreaseDetections: [priceIncrease()],
        budgetCategories: [budgetCategory({ percentSpent: 90 })],
      })
    )
    expect(alerts).toHaveLength(4)
    expect(alerts.map((a) => a.type).sort()).toEqual(
      ['budget_risk', 'forecast_shortfall', 'recurring_price_increase', 'upcoming_obligation'].sort()
    )
  })

  describe('high credit-card cycle spend', () => {
    // billingCycleDay 10, TODAY = 2026-08-16 -> current open cycle is
    // 2026-08-11..2026-09-10, previous CLOSED cycle is 2026-07-11..2026-08-10.
    it('fires a warning when current-cycle spend-so-far already exceeds the previous complete cycle by threshold', () => {
      const alerts = buildFinancialAlerts(
        baseInput({
          creditCardCycles: [
            creditCardCycleAccount({
              transactions: [
                { amount_agorot: -100000, txn_date: '2026-07-20', transfer_id: null }, // previous cycle: ₪1000
                { amount_agorot: -140000, txn_date: '2026-08-12', transfer_id: null }, // current cycle: ₪1400
              ],
            }),
          ],
        })
      )
      expect(alerts).toHaveLength(1)
      expect(alerts[0]?.type).toBe('high_credit_card_cycle_spend')
      expect(alerts[0]?.severity).toBe('warning')
      expect(alerts[0]?.amountAgorot).toBe(40000)
    })

    it('fires critical for a much larger excess', () => {
      const alerts = buildFinancialAlerts(
        baseInput({
          creditCardCycles: [
            creditCardCycleAccount({
              transactions: [
                { amount_agorot: -100000, txn_date: '2026-07-20', transfer_id: null },
                { amount_agorot: -200000, txn_date: '2026-08-12', transfer_id: null }, // ₪2000, +100%
              ],
            }),
          ],
        })
      )
      expect(alerts[0]?.severity).toBe('critical')
    })

    it('produces no alert with no previous-cycle spend at all (no baseline to compare against)', () => {
      const alerts = buildFinancialAlerts(
        baseInput({
          creditCardCycles: [
            creditCardCycleAccount({
              transactions: [{ amount_agorot: -140000, txn_date: '2026-08-12', transfer_id: null }],
            }),
          ],
        })
      )
      expect(alerts).toEqual([])
    })

    it('produces no alert when the excess is below the meaningful threshold (false-positive prevention)', () => {
      const alerts = buildFinancialAlerts(
        baseInput({
          creditCardCycles: [
            creditCardCycleAccount({
              transactions: [
                { amount_agorot: -100000, txn_date: '2026-07-20', transfer_id: null },
                { amount_agorot: -110000, txn_date: '2026-08-12', transfer_id: null }, // +10%, ₪100 excess
              ],
            }),
          ],
        })
      )
      expect(alerts).toEqual([])
    })
  })

  describe('category spending above typical', () => {
    it('fires when this month already exceeds the historical median by threshold', () => {
      const alerts = buildFinancialAlerts(
        baseInput({
          categorySpend: {
            currentMonth: [{ categoryId: 'cat-groceries', categoryNameHe: 'מכולת', spentAgorot: 50000 }],
            historicalMonths: [
              [{ categoryId: 'cat-groceries', categoryNameHe: 'מכולת', spentAgorot: 20000 }],
              [{ categoryId: 'cat-groceries', categoryNameHe: 'מכולת', spentAgorot: 22000 }],
            ],
          },
        })
      )
      expect(alerts).toHaveLength(1)
      expect(alerts[0]?.type).toBe('category_spend_above_typical')
      expect(alerts[0]?.severity).toBe('warning')
    })

    it('produces no alert when spend is close to typical (false-positive prevention)', () => {
      const alerts = buildFinancialAlerts(
        baseInput({
          categorySpend: {
            currentMonth: [{ categoryId: 'cat-groceries', categoryNameHe: 'מכולת', spentAgorot: 25000 }],
            historicalMonths: [
              [{ categoryId: 'cat-groceries', categoryNameHe: 'מכולת', spentAgorot: 20000 }],
              [{ categoryId: 'cat-groceries', categoryNameHe: 'מכולת', spentAgorot: 22000 }],
            ],
          },
        })
      )
      expect(alerts).toEqual([])
    })

    it('produces no alert when categorySpend is unavailable (that source errored)', () => {
      const alerts = buildFinancialAlerts(baseInput({ categorySpend: null }))
      expect(alerts).toEqual([])
    })
  })

  describe('savings goal behind schedule', () => {
    it('fires a warning for an incomplete goal whose target date has already passed', () => {
      const alerts = buildFinancialAlerts(
        baseInput({ savingsGoals: [savingsGoal({ targetDate: '2026-08-01' })] })
      )
      expect(alerts).toHaveLength(1)
      expect(alerts[0]?.type).toBe('savings_goal_behind')
      expect(alerts[0]?.severity).toBe('warning')
      expect(alerts[0]?.amountAgorot).toBe(400000)
    })

    it('produces no alert for a goal with a future target date', () => {
      const alerts = buildFinancialAlerts(
        baseInput({ savingsGoals: [savingsGoal({ targetDate: '2026-12-01' })] })
      )
      expect(alerts).toEqual([])
    })

    it('produces no alert for a goal with no target date at all (nothing deterministic to compare against)', () => {
      const alerts = buildFinancialAlerts(
        baseInput({ savingsGoals: [savingsGoal({ targetDate: null })] })
      )
      expect(alerts).toEqual([])
    })

    it('produces no alert for a completed goal, even with an overdue target date', () => {
      const alerts = buildFinancialAlerts(
        baseInput({
          savingsGoals: [savingsGoal({ currentAgorot: 500000, targetAgorot: 500000, targetDate: '2020-01-01' })],
        })
      )
      expect(alerts).toEqual([])
    })
  })

  describe('excess cash available to accelerate a savings goal', () => {
    it('fires info when safe-to-spend exceeds the meaningful threshold and an incomplete goal exists', () => {
      const alerts = buildFinancialAlerts(
        baseInput({ safeToSpendAgorot: 250000, savingsGoals: [savingsGoal()] })
      )
      expect(alerts).toHaveLength(1)
      expect(alerts[0]?.type).toBe('excess_cash_available')
      expect(alerts[0]?.severity).toBe('info')
    })

    it('produces no alert when there is no incomplete goal to accelerate', () => {
      const alerts = buildFinancialAlerts(
        baseInput({
          safeToSpendAgorot: 250000,
          savingsGoals: [savingsGoal({ currentAgorot: 500000, targetAgorot: 500000 })],
        })
      )
      expect(alerts).toEqual([])
    })

    it('produces no alert when safe-to-spend is below the meaningful threshold (false-positive prevention)', () => {
      const alerts = buildFinancialAlerts(
        baseInput({ safeToSpendAgorot: 50000, savingsGoals: [savingsGoal()] })
      )
      expect(alerts).toEqual([])
    })

    it('produces no alert when safeToSpendAgorot is unavailable (null, that source errored)', () => {
      const alerts = buildFinancialAlerts(baseInput({ safeToSpendAgorot: null, savingsGoals: [savingsGoal()] }))
      expect(alerts).toEqual([])
    })
  })

  describe('low-balance warning (current state, before going negative)', () => {
    it('fires critical when safe-to-spend is already negative', () => {
      const alerts = buildFinancialAlerts(baseInput({ safeToSpendAgorot: -5000 }))
      expect(alerts).toHaveLength(1)
      expect(alerts[0]?.type).toBe('low_balance_warning')
      expect(alerts[0]?.severity).toBe('critical')
      expect(alerts[0]?.amountAgorot).toBe(-5000)
    })

    it('fires warning when safe-to-spend is positive but below the low-balance threshold', () => {
      const alerts = buildFinancialAlerts(baseInput({ safeToSpendAgorot: 10000 }))
      expect(alerts[0]?.severity).toBe('warning')
    })

    it('produces no alert once safe-to-spend clears the low-balance threshold', () => {
      const alerts = buildFinancialAlerts(baseInput({ safeToSpendAgorot: 50000 }))
      expect(alerts).toEqual([])
    })

    it('produces no alert when safeToSpendAgorot is unavailable (null, that source errored)', () => {
      const alerts = buildFinancialAlerts(baseInput({ safeToSpendAgorot: null }))
      expect(alerts).toEqual([])
    })
  })
})
