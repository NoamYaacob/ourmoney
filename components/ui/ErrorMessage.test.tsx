import { describe, expect, it } from '@jest/globals'
import { render } from '@testing-library/react-native'
import { ErrorMessage } from './ErrorMessage'

describe('ErrorMessage', () => {
  it('renders the given message with an alert role', async () => {
    const { getByRole } = await render(<ErrorMessage message="משהו השתבש" />)
    const alert = getByRole('alert')
    expect(alert.props.children).toBe('משהו השתבש')
  })
})
