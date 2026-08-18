// UX-completeness audit P2 fix: a savings goal's bar previously reused the
// exact same "danger at >=100%" semantics as a budget's bar — reaching or
// exceeding a savings target is the GOAL, not an overspend, so the bar
// turned red right next to the goal's own "היעד הושג! 🎉" celebration text.
import { describe, expect, it } from '@jest/globals'
import { render } from '@testing-library/react-native'
import { ProgressBar } from './ProgressBar'

async function renderTree(percent: number | null, overBudget?: boolean, positiveAtLimit?: boolean) {
  const { toJSON } = await render(<ProgressBar percent={percent} overBudget={overBudget} positiveAtLimit={positiveAtLimit} />)
  return toJSON() as unknown as {
    props: { accessibilityValue: { min: number; max: number; now: number } }
    children: [{ props: { className: string } }]
  }
}

describe('ProgressBar', () => {
  it('defaults to danger at/over 100% (budget semantics), unaffected by the new prop', async () => {
    expect((await renderTree(100)).children[0].props.className).toContain('bg-danger-light')
    expect((await renderTree(150)).children[0].props.className).toContain('bg-danger-light')
    expect((await renderTree(50)).children[0].props.className).toContain('bg-positive-light')
  })

  it('stays positive at/over 100% when positiveAtLimit is set, matching a savings goal reaching its target', async () => {
    expect((await renderTree(100, false, true)).children[0].props.className).toContain('bg-positive-light')
    expect((await renderTree(150, false, true)).children[0].props.className).toContain('bg-positive-light')
  })

  // The two props are never actually combined by any real caller (overBudget
  // is budgets-only, positiveAtLimit is goals-only) — this documents the
  // implemented precedence (positiveAtLimit wins) rather than asserting an
  // untested expectation.
  it('lets positiveAtLimit override an explicit overBudget too', async () => {
    expect((await renderTree(80, true, true)).children[0].props.className).toContain('bg-positive-light')
  })

  it('clamps the accessible value to the declared [0, 100] range even when percent exceeds 100', async () => {
    expect((await renderTree(150)).props.accessibilityValue).toEqual({ min: 0, max: 100, now: 100 })
  })
})
