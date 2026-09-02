import { describe, expect, it, jest } from '@jest/globals'
import { fireEvent, render } from '@testing-library/react-native'
import i18n from '@/i18n'
import { ErrorMessage } from './ErrorMessage'

describe('ErrorMessage', () => {
  it('renders the given message with an alert role', async () => {
    const { getByRole } = await render(<ErrorMessage message="משהו השתבש" />)
    const alert = getByRole('alert')
    expect(alert.props.children).toBe('משהו השתבש')
  })

  it('renders no retry button when onRetry is not passed — every existing caller before this', async () => {
    const { queryByText } = await render(<ErrorMessage message="משהו השתבש" />)
    expect(queryByText(i18n.t('common.retry'))).toBeNull()
  })

  it('calls onRetry when the retry button is pressed', async () => {
    const onRetry = jest.fn()
    const { getByText } = await render(<ErrorMessage message="משהו השתבש" onRetry={onRetry} />)
    fireEvent.press(getByText(i18n.t('common.retry')))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})
