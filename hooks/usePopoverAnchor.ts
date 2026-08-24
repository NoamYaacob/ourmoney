// Shared anchor-measurement + viewport-collision math for every
// desktop-web popover in this app (Select's own anchored dropdown,
// DatePickerField's calendar popover). Extracted because the two now
// carry byte-for-byte identical logic — the specific kind of repeat
// worth a shared primitive for, not a speculative abstraction ahead of a
// second caller.
//
// Desktop-web only, by design: below the desktop breakpoint (and on
// native), every caller still renders its original bottom-sheet/modal
// treatment — this hook's `isDesktopWeb` flag is what each caller
// branches its own rendering on, matching Select.tsx's pre-existing
// convention.

import { useRef, useState } from 'react'
import { Platform, useWindowDimensions, type View } from 'react-native'
import { DESKTOP_BREAKPOINT_PX } from '@/constants/layout'

export interface PopoverAnchor {
  x: number
  y: number
  width: number
  height: number
}

const DEFAULT_MARGIN = 8

export function usePopoverAnchor() {
  const [anchor, setAnchor] = useState<PopoverAnchor | null>(null)
  const triggerRef = useRef<View>(null)
  const { width: windowWidth, height: windowHeight } = useWindowDimensions()
  const isDesktopWeb = Platform.OS === 'web' && windowWidth >= DESKTOP_BREAKPOINT_PX

  // Opening never waits on this — measureInWindow is a real native-bridge
  // call with no guaranteed-synchronous callback (and no callback at all
  // in a JS-only test renderer). Callers open first, then call `measure()`;
  // `style()`'s null-anchor fallback covers the render before it resolves.
  function measure() {
    if (isDesktopWeb && triggerRef.current) {
      triggerRef.current.measureInWindow((x, y, width, height) => {
        setAnchor({ x, y, width, height })
      })
    }
  }

  // Clamped so the popover never renders off the bottom/right/left edge of
  // the viewport — flips above the trigger instead of below it when there
  // isn't room underneath, and slides horizontally back onto screen rather
  // than clipping. This app never sets `dir="rtl"` on the DOM (see
  // app/(app)/_layout.tsx's DesktopSideRail comment), so alignment is
  // plain physical pixel math, not a logical-property concern.
  function style(popoverWidth: number, popoverMaxHeight: number, margin = DEFAULT_MARGIN) {
    if (!anchor) {
      return { position: 'absolute' as const, top: 80, left: windowWidth / 2 - popoverWidth / 2, width: popoverWidth }
    }
    const fitsBelow = anchor.y + anchor.height + margin + popoverMaxHeight <= windowHeight
    const top = fitsBelow
      ? anchor.y + anchor.height + 4
      : Math.max(margin, anchor.y - popoverMaxHeight - 4)
    // A popover wider than its trigger right-aligns to the trigger's end
    // edge instead of spilling past its start edge — matching how every
    // reversed two-region split in this app anchors its primary content.
    const preferredLeft = popoverWidth > anchor.width ? anchor.x + anchor.width - popoverWidth : anchor.x
    const left = Math.min(Math.max(preferredLeft, margin), windowWidth - popoverWidth - margin)
    return { position: 'absolute' as const, top, left, width: popoverWidth }
  }

  return { triggerRef, anchor, isDesktopWeb, measure, style, windowWidth, windowHeight }
}
