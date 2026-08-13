// Responsive/desktop pass: Screen's `width` prop selects one of the shared
// CONTENT_WIDTH tokens (constants/layout.ts). RNTL can't evaluate real CSS
// media queries, so this asserts the structural thing that actually matters
// — the right className reaches the rendered tree for each variant, and the
// default (no prop passed) is 'narrow', preserving every existing screen's
// current appearance until it opts into a wider variant.
import { describe, expect, it } from '@jest/globals'
import { render } from '@testing-library/react-native'
import { Text } from 'react-native'
import { Screen } from './Screen'

describe('Screen width variants', () => {
  it('defaults to the narrow content-width clamp when no width prop is passed', async () => {
    const { getByText } = await render(
      <Screen scroll={false}>
        <Text>content</Text>
      </Screen>
    )
    const className = getByText('content').parent?.props.className as string
    expect(className).toContain('max-w-[600px]')
  })

  it('applies the medium content-width clamp when width="medium"', async () => {
    const { getByText } = await render(
      <Screen scroll={false} width="medium">
        <Text>content</Text>
      </Screen>
    )
    const className = getByText('content').parent?.props.className as string
    expect(className).toContain('max-w-[800px]')
  })

  it('applies the wide content-width clamp, including the desktop-only growth to 1150px, when width="wide"', async () => {
    const { getByText } = await render(
      <Screen scroll={false} width="wide">
        <Text>content</Text>
      </Screen>
    )
    const className = getByText('content').parent?.props.className as string
    expect(className).toContain('max-w-[820px]')
    expect(className).toContain('max-w-[1150px]')
  })
})
