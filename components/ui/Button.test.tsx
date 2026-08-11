import { describe, expect, it, jest } from '@jest/globals'
import { fireEvent, render } from '@testing-library/react-native'
import { Button } from './Button'

describe('Button', () => {
  it('renders the title and calls onPress when tapped', async () => {
    const onPress = jest.fn()
    const { getByText } = await render(<Button title="שליחה" onPress={onPress} />)

    fireEvent.press(getByText('שליחה'))
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('does not call onPress when disabled', async () => {
    const onPress = jest.fn()
    const { getByText } = await render(<Button title="שליחה" onPress={onPress} disabled />)

    fireEvent.press(getByText('שליחה'))
    expect(onPress).not.toHaveBeenCalled()
  })

  it('shows a spinner instead of the title while loading, and does not call onPress', async () => {
    const onPress = jest.fn()
    const { queryByText, getByRole } = await render(<Button title="שליחה" onPress={onPress} loading />)

    expect(queryByText('שליחה')).toBeNull()
    const button = getByRole('button')
    expect(button.props.accessibilityState).toMatchObject({ disabled: true, busy: true })

    fireEvent.press(button)
    expect(onPress).not.toHaveBeenCalled()
  })

  it('exposes an accessible button role', async () => {
    const { getByRole } = await render(<Button title="שליחה" onPress={jest.fn()} />)
    expect(getByRole('button')).toBeTruthy()
  })

  // Milestone 9: the danger variant is what makes a destructive action (e.g.
  // delete account) visually distinct from a plain primary button.
  it('renders the danger variant and still calls onPress when tapped', async () => {
    const onPress = jest.fn()
    const { getByText } = await render(<Button title="מחיקת חשבון" onPress={onPress} variant="danger" />)

    fireEvent.press(getByText('מחיקת חשבון'))
    expect(onPress).toHaveBeenCalledTimes(1)
  })
})
