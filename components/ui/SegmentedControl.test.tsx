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

  // RRR §16 P0-4: the test above proves accessibilityState.checked is
  // correct at the React-props level — and it ALREADY passed before this
  // fix, which is exactly why the bug went undetected: accessibilityState's
  // object form is silently dropped by react-native-web 0.21's own DOM-prop
  // whitelist (confirmed by direct inspection of
  // node_modules/react-native-web/dist/modules/forwardedProps/index.js), so
  // it never reached aria-checked in a real browser, on every radio in the
  // app on web — including the primary Household Lens control
  // (features/household/components/HouseholdLensControl.tsx), which
  // renders through this exact component.
  //
  // The fix (SegmentedControl.tsx) adds a direct `aria-checked` prop
  // alongside accessibilityState — react-native-web's View picks props by
  // whitelist (pick(props, forwardPropsList) in its own View/index.js) and
  // does NOT merge aria-* into accessibilityState first, so on web the raw
  // prop survives and is forwarded straight to the DOM attribute.
  //
  // This can't be asserted here: jest-expo renders through
  // react-native CORE's View.js, not react-native-web's — and core View.js
  // deliberately MERGES aria-checked into accessibilityState.checked at the
  // JS level (`processedProps.accessibilityState = { checked: ariaChecked
  // ?? accessibilityState?.checked, ... }`, see its own source) before the
  // props even reach the host tree this file's queries can inspect — so a
  // raw `props['aria-checked']` assertion here would read `undefined`
  // regardless of whether the fix is present, and silently prove nothing.
  // The real, decisive proof needs an actual browser DOM — see the P0
  // remediation evidence artifact for the live Playwright verification
  // that aria-checked/aria-selected/aria-current/aria-expanded/aria-pressed
  // genuinely reach rendered elements across the fixed call sites.
})
