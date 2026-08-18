// Phase 3.1: the amount input previously center-aligned its text inside a
// fixed min-width box, which left visible dead space between the "₪"
// symbol and a short/empty value — this guards the fix (right-aligned text,
// flush against the symbol) so it doesn't silently regress back to center.
import { describe, expect, it, jest } from '@jest/globals'
import { render } from '@testing-library/react-native'
import { AmountField } from './AmountField'

describe('AmountField', () => {
  it('right-aligns the input text so it stays flush against the ₪ symbol', async () => {
    const { getByLabelText } = await render(
      <AmountField label="סכום" value="" onChangeText={jest.fn()} placeholder="0.00" />
    )

    const input = getByLabelText('סכום')
    expect(input.props.style).toEqual(expect.objectContaining({ textAlign: 'right' }))
  })

  it('renders the current value via the same controlled TextInput', async () => {
    const { getByDisplayValue } = await render(
      <AmountField label="סכום" value="125.5" onChangeText={jest.fn()} placeholder="0.00" />
    )

    expect(getByDisplayValue('125.5')).toBeTruthy()
  })

  // Desktop/RTL polish pass (real-browser regression): native Yoga
  // auto-mirrors `flex-row` under the forced-RTL flag, but NativeWind's
  // web-compiled CSS does not — a real headless-browser measurement found
  // "₪" rendering left of the digits on web without this class. Guards the
  // actual fix (the web-scoped reversed row), not just "some row exists".
  it('reverses the ₪-and-input row on web so the symbol stays visually first (right side)', async () => {
    const { getByLabelText } = await render(
      <AmountField label="סכום" value="" onChangeText={jest.fn()} placeholder="0.00" />
    )

    const row = getByLabelText('סכום').parent
    expect(row?.props.className as string).toContain('web:flex-row-reverse')
  })
})
