// Responsive/desktop layout pass: shared content-width tokens so no screen
// hardcodes its own max-width literal. Mobile is always full width (existing
// appearance, unchanged) — these only take effect from `tablet` (>=768px)
// up, and only on `web` (native iPhone/iPad layout is untouched). `wide`
// grows further at `desktop` (>=1200px); `narrow` and `medium` intentionally
// stay flat so forms/settings never stretch that far.
export const CONTENT_WIDTH = {
  narrow: 'w-full web:tablet:max-w-[600px] web:tablet:mx-auto',
  medium: 'w-full web:tablet:max-w-[800px] web:tablet:mx-auto',
  wide: 'w-full web:tablet:max-w-[820px] web:tablet:mx-auto web:desktop:max-w-[1150px]',
} as const

export type ContentWidth = keyof typeof CONTENT_WIDTH

// Shared with the `desktop` Tailwind screen (tailwind.config.js) — the pixel
// value CSS-only `web:desktop:` classes can't cover on its own, needed
// wherever JS must branch on width directly (native style objects, Modal
// animationType, etc.) instead of via className.
export const DESKTOP_BREAKPOINT_PX = 1200

// Shared web width clamp for centered dialogs/sheets (Select's bottom
// sheet, the confirm Modal) — was duplicated as a literal in each caller.
// Applies at every web width (not just tablet/desktop): on a narrow mobile
// browser it's a no-op since the viewport is already under 560px; on a
// wider one it keeps the dialog from stretching edge to edge. Native mobile
// bottom-sheet behavior is untouched (no `web:` match off-web).
export const DIALOG_WIDTH_CLASS = 'web:max-w-[560px] web:self-center'
