import { useEffect } from 'react'
import { create } from 'zustand'

// DEV ONLY — lets tabbed pages publish their active tab value so the TitleBar
// path display can resolve down to the open sub-tab's source file. The tab
// state in Settings/EditProduct/EditBundle lives in local React state (not the
// URL), so the route-only file map in TitleBar can't see it without this bridge.
interface DevTabStore {
  tab: string | null
  setTab: (tab: string | null) => void
}

export const useDevTabStore = create<DevTabStore>((set) => ({
  tab: null,
  setTab: (tab) => set({ tab }),
}))

// Publish the page's current tab while mounted; clear on unmount so a stale tab
// from a previous page never bleeds into the next route's path display.
export function usePublishDevTab(tab: string | null) {
  const setTab = useDevTabStore((s) => s.setTab)
  useEffect(() => {
    setTab(tab)
    return () => setTab(null)
  }, [tab, setTab])
}
