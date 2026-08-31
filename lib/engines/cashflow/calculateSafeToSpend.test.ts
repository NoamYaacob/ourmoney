import { describe, expect, it } from '@jest/globals'
import { calculateSafeToSpend, type PlannedObligationForecastInput, type SafeToSpendInput } from './calculateSafeToSpend'
import type { RecurringForecastTemplate } from './forecastRecurringOccurrences'
import type { InstallmentPlanForecastTemplate } from './forecastInstallmentOccurrences'

function obligation(overrides: Partial<PlannedObligationForecastInput> = {}): PlannedObligationForecastInput {
  return {
    id: 'ob-1',
    name: 'ארנונה',
    amountAgorot: 47500,
    dueDate: '2026-09-10',
    status: 'upcoming',
    categoryId: null,
    accountId: null,
    ...overrides,
  }
}

function recurring(overrides: Partial<RecurringForecastTemplate> = {}): RecurringForecastTemplate {
  return {
    id: 'rec-1',
    description: 'אינטרנט',
    amountAgorot: -15000,
    frequency: 'monthly',
    dayOfMonth: 18,
    nextDueDate: '2026-09-18',
    isActive: true,
    categoryId: null,
    accountId: null,
    ...overrides,
  }
}

function installmentPlan(overrides: Partial<InstallmentPlanForecastTemplate> = {}): InstallmentPlanForecastTemplate {
  return {
    id: 'plan-1',
    description: 'מקרר חדש',
    totalAgorot: 300000,
    installmentCount: 3,
    monthlyAgorot: 100000,
    firstChargeDate: '2026-09-10',
    lastMaterializedIndex: 0,
    categoryId: null,
    accountId: null,
    ...overrides,
  }
}

function baseInput(overrides: Partial<SafeToSpendInput> = {}): SafeToSpendInput {
  return {
    availableCashAgorot: 830000,
    obligations: [],
    recurringTemplates: [],
    installmentPlans: [],
    horizonEnd: '2026-09-30',
    ...overrides,
  }
}

describe('calculateSafeToSpend', () => {
  it('returns available cash unchanged when there are no obligations or recurring charges', () => {
    const result = calculateSafeToSpend(baseInput({ availableCashAgorot: 500000 }))
    expect(result).toEqual({
      availableCashAgorot: 500000,
      plannedObligationsAgorot: 0,
      recurringAgorot: 0,
      installmentsAgorot: 0,
      reservedAgorot: 0,
      safeToSpendAgorot: 500000,
      shortfallAgorot: 0,
      items: [],
    })
  })

  it('subtracts a not-yet-materialized instalment occurrence within the horizon', () => {
    const result = calculateSafeToSpend(
      baseInput({ availableCashAgorot: 500000, installmentPlans: [installmentPlan()] })
    )
    expect(result.installmentsAgorot).toBe(100000)
    expect(result.reservedAgorot).toBe(100000)
    expect(result.safeToSpendAgorot).toBe(400000)
    expect(result.items).toEqual([
      { sourceType: 'installment', sourceId: 'plan-1', description: 'מקרר חדש', amountAgorot: 100000, date: '2026-09-10', categoryId: null, accountId: null },
    ])
  })

  it('combines obligations, recurring, and instalments into one reserved total', () => {
    const result = calculateSafeToSpend(
      baseInput({
        availableCashAgorot: 830000,
        obligations: [obligation()],
        recurringTemplates: [recurring()],
        installmentPlans: [installmentPlan()],
      })
    )
    expect(result.plannedObligationsAgorot).toBe(47500)
    expect(result.recurringAgorot).toBe(15000)
    expect(result.installmentsAgorot).toBe(100000)
    expect(result.reservedAgorot).toBe(162500)
    expect(result.safeToSpendAgorot).toBe(667500)
    expect(result.items).toHaveLength(3)
  })

  it('does not double count an already-materialized instalment (resumes from lastMaterializedIndex + 1)', () => {
    const result = calculateSafeToSpend(
      baseInput({ installmentPlans: [installmentPlan({ lastMaterializedIndex: 1, firstChargeDate: '2026-08-10' })] })
    )
    expect(result.items).toHaveLength(1)
    expect(result.items[0]?.date).toBe('2026-09-10')
  })

  it('excludes an instalment plan fully materialized already (nothing left to forecast)', () => {
    const result = calculateSafeToSpend(baseInput({ installmentPlans: [installmentPlan({ lastMaterializedIndex: 3 })] }))
    expect(result.items).toEqual([])
  })

  it('subtracts a single upcoming obligation', () => {
    const result = calculateSafeToSpend(baseInput({ availableCashAgorot: 500000, obligations: [obligation()] }))
    expect(result.plannedObligationsAgorot).toBe(47500)
    expect(result.reservedAgorot).toBe(47500)
    expect(result.safeToSpendAgorot).toBe(452500)
    expect(result.items).toEqual([
      { sourceType: 'obligation', sourceId: 'ob-1', description: 'ארנונה', amountAgorot: 47500, date: '2026-09-10', categoryId: null, accountId: null },
    ])
  })

  it('sums multiple upcoming obligations', () => {
    const result = calculateSafeToSpend(
      baseInput({
        obligations: [
          obligation({ id: 'ob-1', amountAgorot: 47500, dueDate: '2026-09-10' }),
          obligation({ id: 'ob-2', name: 'ביטוח רכב', amountAgorot: 80000, dueDate: '2026-09-15' }),
        ],
      })
    )
    expect(result.plannedObligationsAgorot).toBe(127500)
    expect(result.items).toHaveLength(2)
  })

  it('combines planned obligations and recurring charges into one reserved total', () => {
    const result = calculateSafeToSpend(
      baseInput({
        availableCashAgorot: 830000,
        obligations: [obligation()],
        recurringTemplates: [recurring()],
      })
    )
    expect(result.plannedObligationsAgorot).toBe(47500)
    expect(result.recurringAgorot).toBe(15000)
    expect(result.reservedAgorot).toBe(62500)
    expect(result.safeToSpendAgorot).toBe(767500)
    expect(result.shortfallAgorot).toBe(0)
  })

  it('produces a shortfall (negative safe-to-spend) when reserved exceeds available cash', () => {
    const result = calculateSafeToSpend(
      baseInput({
        availableCashAgorot: 30000,
        obligations: [obligation({ amountAgorot: 47500 })],
      })
    )
    expect(result.safeToSpendAgorot).toBe(-17500)
    expect(result.shortfallAgorot).toBe(17500)
  })

  it('returns exactly zero safe-to-spend when reserved exactly equals available cash', () => {
    const result = calculateSafeToSpend(
      baseInput({ availableCashAgorot: 47500, obligations: [obligation({ amountAgorot: 47500 })] })
    )
    expect(result.safeToSpendAgorot).toBe(0)
    expect(result.shortfallAgorot).toBe(0)
  })

  it('excludes an obligation due after the horizon end', () => {
    const result = calculateSafeToSpend(
      baseInput({ horizonEnd: '2026-09-30', obligations: [obligation({ dueDate: '2026-10-01' })] })
    )
    expect(result.items).toEqual([])
    expect(result.plannedObligationsAgorot).toBe(0)
  })

  it('excludes a cancelled obligation', () => {
    const result = calculateSafeToSpend(baseInput({ obligations: [obligation({ status: 'cancelled' })] }))
    expect(result.items).toEqual([])
  })

  it('excludes a completed obligation', () => {
    const result = calculateSafeToSpend(baseInput({ obligations: [obligation({ status: 'completed' })] }))
    expect(result.items).toEqual([])
  })

  it('includes an overdue-but-still-upcoming obligation (due_date before today) — still genuinely owed', () => {
    const result = calculateSafeToSpend(baseInput({ obligations: [obligation({ dueDate: '2026-08-01' })] }))
    expect(result.items).toHaveLength(1)
  })

  it('excludes an inactive recurring template', () => {
    const result = calculateSafeToSpend(baseInput({ recurringTemplates: [recurring({ isActive: false })] }))
    expect(result.items).toEqual([])
  })

  it('excludes an income (positive amount) recurring template', () => {
    const result = calculateSafeToSpend(baseInput({ recurringTemplates: [recurring({ amountAgorot: 1200000 })] }))
    expect(result.items).toEqual([])
  })

  it('does not double count an already-generated recurring occurrence (next_due_date already advanced)', () => {
    // If generation already ran through 2026-09-01, next_due_date reflects
    // the NEXT ungenerated occurrence — the engine must not re-add 09-01.
    const result = calculateSafeToSpend(
      baseInput({ horizonEnd: '2026-10-31', recurringTemplates: [recurring({ nextDueDate: '2026-10-01', dayOfMonth: 1 })] })
    )
    expect(result.items).toHaveLength(1)
    expect(result.items[0]?.date).toBe('2026-10-01')
  })

  it('does not cross-contaminate independent obligations and recurring identities', () => {
    const result = calculateSafeToSpend(
      baseInput({
        obligations: [obligation({ id: 'ob-1', name: 'ארנונה' }), obligation({ id: 'ob-2', name: 'ביטוח' })],
        recurringTemplates: [recurring({ id: 'rec-1', description: 'אינטרנט' }), recurring({ id: 'rec-2', description: 'נטפליקס', nextDueDate: '2026-09-05', dayOfMonth: 5 })],
      })
    )
    const sourceIds = result.items.map((i) => i.sourceId).sort()
    expect(sourceIds).toEqual(['ob-1', 'ob-2', 'rec-1', 'rec-2'])
  })

  it('sorts items by date ascending, mixing obligation and recurring sources', () => {
    const result = calculateSafeToSpend(
      baseInput({
        obligations: [obligation({ id: 'ob-1', dueDate: '2026-09-20' })],
        recurringTemplates: [recurring({ id: 'rec-1', nextDueDate: '2026-09-05', dayOfMonth: 5 })],
      })
    )
    expect(result.items.map((i) => i.sourceId)).toEqual(['rec-1', 'ob-1'])
  })

  it('handles a month boundary: the horizon end is the last day of the month, an obligation the day after is excluded', () => {
    const result = calculateSafeToSpend(
      baseInput({
        horizonEnd: '2026-08-31',
        obligations: [
          obligation({ id: 'ob-in', dueDate: '2026-08-31' }),
          obligation({ id: 'ob-out', dueDate: '2026-09-01' }),
        ],
      })
    )
    expect(result.items.map((i) => i.sourceId)).toEqual(['ob-in'])
  })

  it('produces only integer agorot in every numeric field', () => {
    const result = calculateSafeToSpend(
      baseInput({
        availableCashAgorot: 830001,
        obligations: [obligation({ amountAgorot: 47501 })],
        recurringTemplates: [recurring({ amountAgorot: -15003 })],
      })
    )
    for (const value of [
      result.availableCashAgorot,
      result.plannedObligationsAgorot,
      result.recurringAgorot,
      result.installmentsAgorot,
      result.reservedAgorot,
      result.safeToSpendAgorot,
      result.shortfallAgorot,
      ...result.items.map((i) => i.amountAgorot),
    ]) {
      expect(Number.isInteger(value)).toBe(true)
    }
  })
})
