// Checkpoint 3 — the Level-2 sub-region primitive (design-review/SYSTEM.md
// §3). Covers the tone variants (neutral has no border/fill; warning/danger
// reuse the already-proven tinted-strip classes) and the reciprocal warning
// InsetGroup owns: rendered outside any SurfacePanel, it's very likely the
// caller wanted a Level-1 panel instead.
import { describe, expect, it, jest, afterEach } from '@jest/globals'
import { render } from '@testing-library/react-native'
import { Text } from 'react-native'
import { InsetGroup } from './InsetGroup'
import { SurfacePanel } from './SurfacePanel'

describe('InsetGroup', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('applies no border/fill classes for the default neutral tone', async () => {
    const { getByText } = await render(
      <SurfacePanel>
        <InsetGroup>
          <Text>content</Text>
        </InsetGroup>
      </SurfacePanel>
    )
    const className = getByText('content').parent?.props.className as string
    expect(className).not.toContain('border')
    expect(className).not.toContain('Surface-light')
  })

  it('applies the tinted-strip classes for tone="warning"', async () => {
    const { getByText } = await render(
      <SurfacePanel>
        <InsetGroup tone="warning">
          <Text>content</Text>
        </InsetGroup>
      </SurfacePanel>
    )
    const className = getByText('content').parent?.props.className as string
    expect(className).toContain('warningBorder-light')
    expect(className).toContain('warningSurface-light')
  })

  it('applies the tinted-strip classes for tone="danger"', async () => {
    const { getByText } = await render(
      <SurfacePanel>
        <InsetGroup tone="danger">
          <Text>content</Text>
        </InsetGroup>
      </SurfacePanel>
    )
    const className = getByText('content').parent?.props.className as string
    expect(className).toContain('dangerBorder-light')
    expect(className).toContain('dangerSurface-light')
  })

  it('does not warn when rendered inside a SurfacePanel', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    await render(
      <SurfacePanel>
        <InsetGroup>
          <Text>content</Text>
        </InsetGroup>
      </SurfacePanel>
    )
    expect(warn).not.toHaveBeenCalled()
  })

  it('warns when rendered outside any SurfacePanel', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    await render(
      <InsetGroup>
        <Text>content</Text>
      </InsetGroup>
    )
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('[InsetGroup]'))
  })
})
