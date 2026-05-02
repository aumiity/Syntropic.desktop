import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface CurrentUser {
  id: number
  name: string
  email: string
  role: string
}

interface UserStore {
  current: CurrentUser | null
  setCurrent: (u: CurrentUser) => void
  hydrate: () => Promise<void>
}

export const useUserStore = create<UserStore>()(
  persist(
    (set, get) => ({
      current: null,
      setCurrent: (u) => set({ current: u }),
      hydrate: async () => {
        if (get().current) return
        const u = await (window as any).api.auth.getCurrentUser()
        if (u) set({ current: u as CurrentUser })
      },
    }),
    { name: 'user-store' }
  )
)

export function getCurrentUserId(): number {
  const u = useUserStore.getState().current
  if (!u) throw new Error('ยังไม่ได้โหลดข้อมูลผู้ใช้งาน')
  return u.id
}
