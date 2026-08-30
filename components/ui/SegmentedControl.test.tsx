// Desktop/RTL polish pass (real-browser regression): the option row was a
// plain flex-row, which native auto-mirrors via Yoga under the forced-RTL
// flag but NativeWind's web-compiled CSS does not — a headless-browser
// measurement found the first-listed option (e.g. expense, or Settings'
// "system" appearance choice) rendering on the physical left on web,
// instead of the right as RTL convention dictates. Affects Add
// Transaction's expense/income and shared/personal controls, and
// Settings' appearance picker (shared component).
import { describe, expect, it, jest } from '@jest/globals'
import { render } from '@testing-library/react-native'
import { SegmentedControl } from './SegmentedControl'

describe('SegmentedControl', () => {
  it('reverses the option row on web so the first-listed option renders on the right', async () => {
    const { getByLabelText } = await render(
      <SegmentedControl
        options={[
          { value: 'expense', label: 'הוצאה' },
          { value: 'income', label: 'הכנסה' },
        ]}
        value="expense"
        onChange={jest.fn()}
        accessibilityLabel="type"
      />,
    )

    const container = getByLabelText('type')
    expect(container.props.className as string).toContain('web:flex-row')
  })

  // CP8D fix: role="radio"'s own correct ARIA state is `checked`
  // (aria-checked), not `selected` — the two were never a valid pair, so no
  // screen reader ever heard which segment was actually selected.
  it('exposes the selected segment via accessibilityState.checked, the correct state for accessibilityRole="radio"', async () => {
    const { getByLabelText } = await render(
      <SegmentedControl
        options={[
          { value: 'expense', label: 'הוצאה' },
          { value: 'income', label: 'הכנסה' },
        ]}
        value="income"
        onChange={jest.fn()}
        accessibilityLabel="type"
      />,
    )

    expect(getByLabelText('הכנסה').props.accessibilityState.checked).toBe(true)
    expect(getByLabelText('הוצאה').props.accessibilityState.checked).toBe(false)
  })
})
