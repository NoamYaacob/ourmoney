// Desktop polish pass: a real-browser visual check found the New
// Transaction form stretching edge-to-edge on desktop despite already
// setting `width="narrow"` in code. Root cause: `CONTENT_WIDTH` and
// `DIALOG_WIDTH_CLASS` below are used as className strings via Screen.tsx/
// Select.tsx/Modal.tsx, but tailwind.config.js's `content` scan globs never
// included this directory — Tailwind's JIT compiler only generates CSS for
// class names it can find as literal text in a scanned file, so every
// `web:tablet:max-w-[...]`/`web:desktop:max-w-[...]` utility referenced only
// from here was silently never compiled, making every screen's `width`
// prop a no-op on the actual desktop build. Confirmed by compiling the
// config with Tailwind's CLI and grepping the output before/after adding
// `./constants/**/*.{js,jsx,ts,tsx}` to `content`. This guards the fix
// structurally (content array includes this directory) rather than
// re-invoking the full Tailwind compiler in a test.
import { describe, expect, it } from '@jest/globals'
import { CONTENT_WIDTH, DIALOG_WIDTH_CLASS } from './layout'

describe('tailwind.config.js scans constants/ for className strings', () => {
  it('includes a content glob covering this directory, where CONTENT_WIDTH/DIALOG_WIDTH_CLASS are defined', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const tailwindConfig = require('../tailwind.config.js') as { content: string[] }

    const scansConstants = tailwindConfig.content.some((pattern) => pattern.includes('constants'))
    expect(scansConstants).toBe(true)
  })
})

describe('CONTENT_WIDTH / DIALOG_WIDTH_CLASS', () => {
  it('every width variant stays web-scoped, so native mobile/iPad layout is never affected', () => {
    for (const classes of Object.values(CONTENT_WIDTH)) {
      for (const token of classes.split(' ')) {
        if (token === 'w-full') continue
        expect(token.startsWith('web:')).toBe(true)
      }
    }
    expect(DIALOG_WIDTH_CLASS.split(' ').every((token) => token.startsWith('web:'))).toBe(true)
  })

  it('narrow and medium stay flat across tablet and desktop (no separate desktop growth), unlike wide', () => {
    expect(CONTENT_WIDTH.narrow).not.toContain('desktop')
    expect(CONTENT_WIDTH.medium).not.toContain('desktop')
    expect(CONTENT_WIDTH.wide).toContain('web:desktop:max-w-[1150px]')
  })
})
