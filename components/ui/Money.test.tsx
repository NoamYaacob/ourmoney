// The one thing this component must never do is make a shortfall look like
// cash. `Money` formatted `Math.abs(agorot)` and re-added the minus only for
// callers that passed `signed`, so every unsigned negative — a cash-flow low
// point below zero, an overdrawn balance, an over-budget remainder — printed
// as a positive figure. Nothing in the suite covered it. These do.

import { describe, expect, it } from '@jest/globals'
import { render } from '@testing-library/react-native'
import { Money } from './Money'
import { formatILS } from '@/lib/money/format'

describe('Money', () => {
  it('renders a negative amount as negative without being asked', async () => {
    const { getByText } = await render(<Money agorot={-1981400} />)
    expect(getByText(formatILS(-1981400))).toBeTruthy()
  })

  it('does not render a plus on a positive amount by default', async () => {
    const { getByText, queryByText } = await render(<Money agorot={1981400} />)
    expect(getByText(formatILS(1981400))).toBeTruthy()
    expect(queryByText(`+${formatILS(1981400)}`)).toBeNull()
  })

  it('adds the plus only where direction is the point', async () => {
    const { getByText } = await render(<Money agorot={1395000} signed />)
    expect(getByText(`+${formatILS(1395000)}`)).toBeTruthy()
  })

  it('does not double the minus when a signed caller passes a negative', async () => {
    // `signed` governs the "+" alone; the formatter already carries the "−".
    const { getByText } = await render(<Money agorot={-122400} signed />)
    expect(getByText(formatILS(-122400))).toBeTruthy()
  })

  it('renders zero plainly, with no sign either way', async () => {
    const { getByText } = await render(<Money agorot={0} signed />)
    expect(getByText(formatILS(0))).toBeTruthy()
  })

  it('keeps every figure tabular and unbroken', async () => {
    // A column of amounts has to align digit-for-digit, and the Hebrew
    // currency string must not wrap its ₪ onto a line of its own.
    const { getByText } = await render(<Money agorot={841260} size="figure" />)
    const node = getByText(formatILS(841260))
    expect(node.props.numberOfLines).toBe(1)
    expect(JSON.stringify(node.props.style)).toContain('tabular-nums')
  })
})
