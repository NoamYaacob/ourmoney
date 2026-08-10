import { describe, expect, it, jest } from '@jest/globals'
import { fireEvent, render } from '@testing-library/react-native'
import { Input } from './Input'

describe('Input', () => {
  it('renders the label and forwards text changes', async () => {
    const onChangeText = jest.fn()
    const { getByText, getByDisplayValue } = await render(
      <Input label="אימייל" value="a@b.com" onChangeText={onChangeText} />
    )

    expect(getByText('אימייל')).toBeTruthy()
    fireEvent.changeText(getByDisplayValue('a@b.com'), 'c@d.com')
    expect(onChangeText).toHaveBeenCalledWith('c@d.com')
  })

  it('does not render an error message when none is given', async () => {
    const { queryByRole } = await render(<Input label="אימייל" value="" onChangeText={jest.fn()} />)
    expect(queryByRole('alert')).toBeNull()
  })

  it('renders the error message when given', async () => {
    const { getByRole } = await render(
      <Input label="אימייל" value="" onChangeText={jest.fn()} error="כתובת האימייל אינה תקינה" />
    )
    expect(getByRole('alert').props.children).toBe('כתובת האימייל אינה תקינה')
  })
})
