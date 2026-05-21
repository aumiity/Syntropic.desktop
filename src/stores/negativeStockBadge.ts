import { create } from 'zustand'

// Sidebar badge state for the negative-stock queue.
//
// One source of truth across the renderer — call `refresh()` after every event
// that can change the count: pos:saveBill, purchase:save, reports:voidSale,
// negativeStock:reconcile, negativeStock:dismiss. The Sidebar reads `count`
// directly to decide whether to render the warning badge.
//
// Failures are swallowed — the badge is non-critical UX. We don't want a
// transient IPC hiccup to throw an error toast at the user just because the
// count couldn't refresh.

interface NegativeStockBadgeState {
  count: number
  refresh: () => Promise<void>
}

export const useNegativeStockBadge = create<NegativeStockBadgeState>((set) => ({
  count: 0,
  refresh: async () => {
    try {
      const c = await (window as any).api.negativeStock.count()
      set({ count: typeof c === 'number' ? c : 0 })
    } catch {
      /* badge is non-critical */
    }
  },
}))
