import { Text } from 'react-native'
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
import { act, fireEvent, render, waitFor } from '@testing-library/react-native'
import { AppErrorBoundary } from './AppErrorBoundary'

let shouldThrow = true

function BrokenChild() {
  if (shouldThrow) {
    throw new Error('boom')
  }

  return <Text>Recovered</Text>
}

describe('AppErrorBoundary', () => {
  beforeEach(() => {
    shouldThrow = true
    jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('renders its children when there is no error', async () => {
    shouldThrow = false

    const { getByText } = await render(
      <AppErrorBoundary title="Error" message="Something went wrong" retryLabel="Retry">
        <Text>Healthy</Text>
      </AppErrorBoundary>,
    )

    expect(getByText('Healthy')).toBeTruthy()
  })

  it('renders fallback UI when a child throws', async () => {
    const { getByText } = await render(
      <AppErrorBoundary title="Error" message="Something went wrong" retryLabel="Retry">
        <BrokenChild />
      </AppErrorBoundary>,
    )

    expect(getByText('Error')).toBeTruthy()
    expect(getByText('Something went wrong')).toBeTruthy()
    expect(getByText('Retry')).toBeTruthy()
  })

  it('reports the captured error', async () => {
    const onError = jest.fn<(error: Error) => void>()

    await render(
      <AppErrorBoundary
        title="Error"
        message="Something went wrong"
        retryLabel="Retry"
        onError={onError}
      >
        <BrokenChild />
      </AppErrorBoundary>,
    )

    expect(onError).toHaveBeenCalledTimes(1)

    const error = onError.mock.calls.at(0)?.[0]

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toBe('boom')
  })

  it('can retry rendering children', async () => {
    const { getByText } = await render(
      <AppErrorBoundary title="Error" message="Something went wrong" retryLabel="Retry">
        <BrokenChild />
      </AppErrorBoundary>,
    )

    shouldThrow = false

    await act(async () => {
      fireEvent.press(getByText('Retry'))
    })

    await waitFor(() => {
      expect(getByText('Recovered')).toBeTruthy()
    })
  })
})
