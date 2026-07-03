import { create } from 'zustand'

// DEV-ONLY — shared state for the UI review-notes overlay (src/dev/ReviewOverlay.tsx).
// Lifted out of the overlay's local useState so its launcher (toggle note mode +
// open list panel) can live in the TitleBar instead of a floating bottom-right
// widget. The overlay owns the notes array and mirrors its length into `count`
// here so the TitleBar chip can show it. Tree-shaken with the overlay in prod.
interface ReviewOverlayState {
  noting: boolean
  panelOpen: boolean
  count: number
  setNoting: (v: boolean) => void
  toggleNoting: () => void
  setPanelOpen: (v: boolean) => void
  togglePanel: () => void
  setCount: (n: number) => void
}

export const useReviewOverlayStore = create<ReviewOverlayState>((set) => ({
  noting: false,
  panelOpen: false,
  count: 0,
  setNoting: (v) => set({ noting: v }),
  toggleNoting: () => set((s) => ({ noting: !s.noting })),
  setPanelOpen: (v) => set({ panelOpen: v }),
  togglePanel: () => set((s) => ({ panelOpen: !s.panelOpen })),
  setCount: (n) => set({ count: n }),
}))
