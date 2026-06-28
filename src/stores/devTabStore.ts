import { useEffect } from 'react'
import { create } from 'zustand'

// DEV ONLY — lets tabbed pages publish their active tab value so the TitleBar
// path display can resolve down to the open sub-tab's source file. Tab state in
// Settings/EditProduct/EditBundle (and their NESTED sub-tabs, e.g. การพิมพ์ ›
// ฉลากยา/ใบเสร็จ) lives in local React state (not the URL), so the route-only
// file map in TitleBar can't see it without this bridge.
//
// `tabs` is a CHAIN, indexed by nesting depth: tabs[0] = the page's top tab,
// tabs[1] = the open sub-tab inside it, and so on. Each tabbed level publishes
// its own slot via usePublishDevTab(value, level) so the path can drill to any
// depth.
interface DevTabStore {
  tabs: string[]
  setTabAt: (level: number, tab: string | null) => void
}

export const useDevTabStore = create<DevTabStore>((set) => ({
  tabs: [],
  setTabAt: (level, tab) =>
    set((s) => {
      const tabs = [...s.tabs]
      // Clear only this slot on unmount (leave deeper slots to their own owners,
      // which clear themselves on unmount). Truncating deeper here would race the
      // child's mount: React fires child effects before the parent re-publishes,
      // so a parent that truncated would wipe the just-published child slot.
      if (tab == null) delete tabs[level]
      else tabs[level] = tab
      return { tabs }
    }),
}))

// Publish this level's current tab while mounted; clear it on unmount so a stale
// tab from a previous page never bleeds into the next route's path display.
export function usePublishDevTab(tab: string | null, level = 0) {
  const setTabAt = useDevTabStore((s) => s.setTabAt)
  useEffect(() => {
    setTabAt(level, tab)
    return () => setTabAt(level, null)
  }, [tab, level, setTabAt])
}
