import { describe, expect, it } from '@jest/globals'
import { render } from '@testing-library/react-native'
import { LoadingSpinner } from './LoadingSpinner'

describe('LoadingSpinner', () => {
  it('exposes a progressbar role and a non-empty label to screen readers', async () => {
    const { getByRole } = await render(<LoadingSpinner />)
    const spinner = getByRole('progressbar')
    expect(spinner.props.accessibilityLabel).toBeTruthy()
  })
})
