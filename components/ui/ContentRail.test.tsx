// Checkpoint 3 — the "Shape A" primary+rail layout primitive (design-review/
// SYSTEM.md §1/§5). Not wired into any screen yet (Transactions/Budget adopt
// it in Checkpoints 4/5) — this covers the class output in isolation: both
// children always render, the width caps/gaps step at `tabletLg` and
// `desktop`, and it stays a stack below `tabletLg` rather than forcing a row.
import { describe, expect, it } from '@jest/globals'
import { render } from '@testing-library/react-native'
import { Text } from 'react-native'
import { ContentRail } from './ContentRail'

describe('ContentRail', () => {
  it('renders both primary and rail content', async () => {
    const { getByText } = await render(<ContentRail primary={<Text>primary content</Text>} rail={<Text>rail content</Text>} />)
    expect(getByText('primary content')).toBeTruthy()
    expect(getByText('rail content')).toBeTruthy()
  })

  it('only switches to a row from tabletLg up, not unconditionally', async () => {
    const { getByText } = await render(<ContentRail primary={<Text>primary content</Text>} rail={<Text>rail content</Text>} />)
    const outerClassName = getByText('primary content').parent?.parent?.props.className as string
    // A bare, unprefixed `flex-row` (not `web:tabletLg:flex-row` or
    // `web:desktop:flex-row`) would force a row at every width, including
    // mobile — the one thing Checkpoint 3 explicitly must not do.
    expect(outerClassName).not.toMatch(/(?<!:)flex-row/)
    expect(outerClassName).toContain('web:tabletLg:flex-row')
  })

  it('caps the primary+rail width at tabletLg and grows it at desktop', async () => {
    const { getByText } = await render(<ContentRail primary={<Text>primary content</Text>} rail={<Text>rail content</Text>} />)
    const outerClassName = getByText('primary content').parent?.parent?.props.className as string
    expect(outerClassName).toContain('web:tabletLg:max-w-[1050px]')
    expect(outerClassName).toContain('web:desktop:max-w-[1320px]')
  })

  it('fixes the rail to a narrower width at tabletLg than at desktop', async () => {
    const { getByText } = await render(<ContentRail primary={<Text>primary content</Text>} rail={<Text>rail content</Text>} />)
    const railClassName = getByText('rail content').parent?.props.className as string
    expect(railClassName).toContain('web:tabletLg:w-[280px]')
    expect(railClassName).toContain('web:desktop:w-80')
  })

  it('composes a caller-supplied className on the outer wrapper', async () => {
    const { getByText } = await render(
      <ContentRail primary={<Text>primary content</Text>} rail={<Text>rail content</Text>} className="web:desktop:mt-6" />
    )
    const outerClassName = getByText('primary content').parent?.parent?.props.className as string
    expect(outerClassName).toContain('web:desktop:mt-6')
  })
})
