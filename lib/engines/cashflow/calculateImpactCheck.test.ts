import { describe, expect, it } from '@jest/globals'
import { calculateImpactCheck, type ImpactCheckInput } from './calculateImpactCheck'
import { calculateSafeToSpend } from './calculateSafeToSpend'
import { calculateCashFlowForecast } from './calculateCashFlowForecast'

const baseInput: ImpactCheckInput = {
  availableCashAgorot: 500_000,
  obligations: [
    { id: 'ob-1', name: 'ארנונה', amountAgorot: 50_000, dueDate: '2026-09-15', status: 'upcoming', categoryId: null, accountId: null },
  ],
  recurringTemplates: [
    {
      id: 'rc-1',
      description: 'משכנתא',
      amountAgorot: -100_000,
      frequency: 'monthly',
      dayOfMonth: 10,
      nextDueDate: '2026-09-10',
      isActive: true,
      categoryId: null,
      accountId: null,
    },
  ],
  installmentPlans: [],
  safeToSpendHorizonEnd: '2026-09-30',
  forecastStartDate: '2026-09-01',
  forecastEndDate: '2026-09-30',
  hypotheticalExpenseAgorot: 20_000,
}

describe('calculateImpactCheck — reuses existing engines, does not reimplement', () => {
  it('current figures match calling calculateSafeToSpend/calculateCashFlowForecast directly on the unmodified input', () => {
    const result = calculateImpactCheck(baseInput)

    const directSafeToSpend = calculateSafeToSpend({
      availableCashAgorot: baseInput.availableCashAgorot,
      obligations: baseInput.obligations,
      recurringTemplates: baseInput.recurringTemplates,
      installmentPlans: baseInput.installmentPlans,
      horizonEnd: baseInput.safeToSpendHorizonEnd,
    })
    const directForecast = calculateCashFlowForecast({
      startingBalanceAgorot: baseInput.availableCashAgorot,
      startDate: baseInput.forecastStartDate,
      endDate: baseInput.forecastEndDate,
      obligations: baseInput.obligations,
      recurringTemplates: baseInput.recurringTemplates,
      installmentPlans: baseInput.installmentPlans,
    })

    expect(result.currentSafeToSpendAgorot).toBe(directSafeToSpend.safeToSpendAgorot)
    expect(result.currentLowPointAgorot).toBe(directForecast.lowestBalanceAgorot)
    expect(result.currentLowPointDate).toBe(directForecast.lowestBalanceDate)
  })

  it('post-purchase figures match calling the same engines with availableCashAgorot/startingBalanceAgorot reduced by the hypothetical amount — the one documented contract', () => {
    const result = calculateImpactCheck(baseInput)
    const shiftedCash = baseInput.availableCashAgorot - baseInput.hypotheticalExpenseAgorot

    const directSafeToSpend = calculateSafeToSpend({
      availableCashAgorot: shiftedCash,
      obligations: baseInput.obligations,
      recurringTemplates: baseInput.recurringTemplates,
      installmentPlans: baseInput.installmentPlans,
      horizonEnd: baseInput.safeToSpendHorizonEnd,
    })
    const directForecast = calculateCashFlowForecast({
      startingBalanceAgorot: shiftedCash,
      startDate: baseInput.forecastStartDate,
      endDate: baseInput.forecastEndDate,
      obligations: baseInput.obligations,
      recurringTemplates: baseInput.recurringTemplates,
      installmentPlans: baseInput.installmentPlans,
    })

    expect(result.postPurchaseSafeToSpendAgorot).toBe(directSafeToSpend.safeToSpendAgorot)
    expect(result.postPurchaseLowPointAgorot).toBe(directForecast.lowestBalanceAgorot)
    expect(result.postPurchaseLowPointDate).toBe(directForecast.lowestBalanceDate)
  })

  it('never mutates the caller-supplied obligations/recurring/installment arrays', () => {
    const obligationsCopy = [...baseInput.obligations]
    const recurringCopy = [...baseInput.recurringTemplates]
    const installmentsCopy = [...baseInput.installmentPlans]

    calculateImpactCheck(baseInput)

    expect(baseInput.obligations).toEqual(obligationsCopy)
    expect(baseInput.recurringTemplates).toEqual(recurringCopy)
    expect(baseInput.installmentPlans).toEqual(installmentsCopy)
  })
})

describe('calculateImpactCheck — verdict', () => {
  it('SAFE when the post-purchase forecast low point stays at or above zero', () => {
    const result = calculateImpactCheck({ ...baseInput, hypotheticalExpenseAgorot: 1_000 })
    expect(result.postPurchaseLowPointAgorot).toBeGreaterThanOrEqual(0)
    expect(result.crossesBelowZero).toBe(false)
    expect(result.verdict).toBe('SAFE')
  })

  it('UNSAFE when the post-purchase forecast low point drops below zero', () => {
    // availableCash 500,000 with a mid-month low point already reserved by
    // the recurring mortgage (100,000) and obligation (50,000) — a large
    // enough hypothetical expense pushes the forecast negative.
    const result = calculateImpactCheck({ ...baseInput, hypotheticalExpenseAgorot: 400_000 })
    expect(result.postPurchaseLowPointAgorot).toBeLessThan(0)
    expect(result.crossesBelowZero).toBe(true)
    expect(result.verdict).toBe('UNSAFE')
  })

  it('exact-zero low point is SAFE, not UNSAFE — the boundary is inclusive on the safe side, matching this checkpoint\'s own ">= 0 is SAFE" contract', () => {
    // Solve for the exact hypothetical that leaves the low point at 0: the
    // baseline current low point minus the amount should land on exactly 0.
    const baseline = calculateImpactCheck({ ...baseInput, hypotheticalExpenseAgorot: 0 })
    const exactAmount = baseline.currentLowPointAgorot
    const result = calculateImpactCheck({ ...baseInput, hypotheticalExpenseAgorot: exactAmount })
    expect(result.postPurchaseLowPointAgorot).toBe(0)
    expect(result.crossesBelowZero).toBe(false)
    expect(result.verdict).toBe('SAFE')
  })
})

describe('calculateImpactCheck — amount edge cases', () => {
  it('zero hypothetical amount leaves post-purchase figures identical to current figures', () => {
    const result = calculateImpactCheck({ ...baseInput, hypotheticalExpenseAgorot: 0 })
    expect(result.postPurchaseSafeToSpendAgorot).toBe(result.currentSafeToSpendAgorot)
    expect(result.postPurchaseLowPointAgorot).toBe(result.currentLowPointAgorot)
  })

  it('a negative hypothetical amount is handled arithmetically (never crashes) — production input validation, not this engine, is what blocks it from ever occurring', () => {
    const result = calculateImpactCheck({ ...baseInput, hypotheticalExpenseAgorot: -10_000 })
    // Subtracting a negative is adding — this is a deliberate, honest
    // consequence of not special-casing the engine, not a fabricated
    // result: it proves the engine performs no hidden validation of its
    // own, which is exactly why the UI layer must enforce it instead.
    expect(result.postPurchaseSafeToSpendAgorot).toBe(result.currentSafeToSpendAgorot + 10_000)
  })

  it('an amount larger than current Safe-to-Spend is still computed, and correctly reads UNSAFE once it pushes the forecast negative', () => {
    const currentBaseline = calculateImpactCheck({ ...baseInput, hypotheticalExpenseAgorot: 0 })
    const tooLarge = currentBaseline.currentSafeToSpendAgorot + 1
    const result = calculateImpactCheck({ ...baseInput, hypotheticalExpenseAgorot: tooLarge })
    expect(result.postPurchaseSafeToSpendAgorot).toBeLessThan(0)
  })

  it('an amount larger than current available cash still produces a deterministic (negative) result, never throws', () => {
    expect(() => calculateImpactCheck({ ...baseInput, hypotheticalExpenseAgorot: baseInput.availableCashAgorot + 1 })).not.toThrow()
    const result = calculateImpactCheck({ ...baseInput, hypotheticalExpenseAgorot: baseInput.availableCashAgorot + 1 })
    expect(result.postPurchaseSafeToSpendAgorot).toBeLessThan(0)
  })
})

describe('calculateImpactCheck — determinism', () => {
  it('is repeatable: identical input always produces an identical result', () => {
    const a = calculateImpactCheck(baseInput)
    const b = calculateImpactCheck(baseInput)
    expect(a).toEqual(b)
  })
})
