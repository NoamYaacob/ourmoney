// How far ahead the desktop cash-flow forecast looks.
//
// This is `useState` promoted to a store for one reason: the desktop mockup
// draws the 30/60/90 selector in the shell's header band, not in the screen
// body, so the control and the screen that obeys it are no longer in the
// same component tree. Same kind of state as periodStore.ts — ephemeral,
// view-only, nothing behind it on the server.
//
// Mobile keeps its own local horizon state; MobileCashFlow has a per-screen
// header of its own and never mounts the desktop bar.

import { create } from 'zustand'

export type CashFlowHorizonDays = '30' | '60' | '90'

interface CashFlowState {
  horizonDays: CashFlowHorizonDays
  setHorizonDays: (horizonDays: CashFlowHorizonDays) => void
}

export const useCashFlowStore = create<CashFlowState>((set) => ({
  horizonDays: '30',
  setHorizonDays: (horizonDays) => set({ horizonDays }),
}))
