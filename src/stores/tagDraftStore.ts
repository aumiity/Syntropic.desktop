import { create } from 'zustand'
import type { TagCell } from '@/lib/tags/types'

// Draft of the price-tag product list, lifted out of the PrintTab page so it
// SURVIVES navigation — same idea as grDraftStore for the goods-receive form.
// Building a 50-up price-tag sheet takes a while; a customer may walk in, so the
// operator must be able to switch to the POS and come back without losing the
// list. In-memory only (no persist middleware): it bridges tab-switching within
// a session, not an app restart (matches grDraftStore).
//
// Typed as (TagCell | null)[] to plug straight into PrintTab's existing
// cells/setCells plumbing; in practice the price-tag list is dense (no holes).
// The Sidebar reads the non-null count to render the red badge on "สินค้า".
type PriceItems = (TagCell | null)[]
type Updater = PriceItems | ((prev: PriceItems) => PriceItems)

interface TagDraftStore {
  priceItems: PriceItems
  setPriceItems: (u: Updater) => void
  clearPriceItems: () => void
}

export const useTagDraftStore = create<TagDraftStore>((set) => ({
  priceItems: [],
  setPriceItems: (u) => set((s) => ({ priceItems: typeof u === 'function' ? u(s.priceItems) : u })),
  clearPriceItems: () => set({ priceItems: [] }),
}))
