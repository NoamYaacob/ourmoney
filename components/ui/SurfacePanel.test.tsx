// Checkpoint 3 — the Level-1 surface primitive (design-review/SYSTEM.md §3).
// Two things worth a regression test: the fixed surface treatment actually
// composes with a caller's own layout classes, and the nesting guard fires
// (in dev) exactly when a SurfacePanel ends up inside another one — the one
// mistake this component exists to make loud instead of a silent double-
// bordered box.
import { describe, expect, it, jest, afterEach } from '@jest/globals'
import { render } from '@testing-library/react-native'
import { Text } from 'react-native'
import { SurfacePanel } from './SurfacePanel'
import { InsetGroup } from './InsetGroup'

describe('SurfacePanel', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('applies the desktop-only Level-1 surface treatment', async () => {
    const { getByText } = await render(
      <SurfacePanel>
        <Text>content</Text>
      </SurfacePanel>
    )
    const className = getByText('content').parent?.props.className as string
    expect(className).toContain('web:desktop:rounded-card')
    expect(className).toContain('web:desktop:border')
    expect(className).toContain('web:desktop:shadow-sm')
  })

  it('composes a caller-supplied layout className alongside the fixed treatment', async () => {
    const { getByText } = await render(
      <SurfacePanel className="web:desktop:flex-1">
        <Text>content</Text>
      </SurfacePanel>
    )
    const className = getByText('content').parent?.props.className as string
    expect(className).toContain('web:desktop:rounded-card')
    expect(className).toContain('web:desktop:flex-1')
  })

  it('does not warn when rendered on its own', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    await render(
      <SurfacePanel>
        <Text>content</Text>
      </SurfacePanel>
    )
    expect(warn).not.toHaveBeenCalled()
  })

  it('warns when a SurfacePanel is nested inside another SurfacePanel', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    await render(
      <SurfacePanel>
        <SurfacePanel>
          <Text>inner</Text>
        </SurfacePanel>
      </SurfacePanel>
    )
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('[SurfacePanel]'))
  })

  it('does not warn when an InsetGroup is nested inside a SurfacePanel', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    await render(
      <SurfacePanel>
        <InsetGroup>
          <Text>inner</Text>
        </InsetGroup>
      </SurfacePanel>
    )
    expect(warn).not.toHaveBeenCalled()
  })
})
