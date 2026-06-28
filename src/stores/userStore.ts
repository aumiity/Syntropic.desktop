import { create } from 'zustand'
import type { PermState } from '@/lib/permissions/registry'

export interface CurrentUser {
  id: number
  name: string
  role: string
  // Permission snapshot captured at login (UX gating via useCan). Real
  // enforcement lives in main (requirePermission). Optional: a refresh path or
  // older login response may omit it → useCan falls back to registry defaults.
  permissions?: Record<string, PermState>
}

interface UserStore {
  current: CurrentUser | null
  login: (u: CurrentUser) => void
  logout: () => void
  lock: () => void
}

// Session is in-memory only — never persisted. Every app launch starts with
// current === null → the LoginGate shows the login screen (no stale session to
// re-verify). See User_Login_System.md §4.1.
// Clear the main-side session too — fire-and-forget. Critical for `lock`: an
// admin who locks the screen must NOT leave the main process still believing the
// caller is admin (otherwise a subsequent staff login would inherit admin
// authority on the same renderer). See User_Login_System.md §4.x / BL-1.
function clearMainSession() {
  try { window.api?.auth?.logout?.() } catch { /* main-side session is best-effort */ }
}

export const useUserStore = create<UserStore>()((set) => ({
  current: null,
  login: (u) => set({ current: u }),
  logout: () => { clearMainSession(); set({ current: null }) },
  lock: () => { clearMainSession(); set({ current: null }) },
}))

// One-time cleanup: older builds persisted the session under this key. Remove it
// so a stale session can never be read back after the no-persist change.
try { localStorage.removeItem('user-store') } catch {}

export function getCurrentUserId(): number {
  const u = useUserStore.getState().current
  if (!u) throw new Error('ยังไม่ได้โหลดข้อมูลผู้ใช้งาน')
  return u.id
}

// Logged-in user's display name (for the receipt "พนักงานขาย" line). Returns
// null when no session — the slip just omits the salesperson line.
export function getCurrentUserName(): string | null {
  return useUserStore.getState().current?.name ?? null
}
