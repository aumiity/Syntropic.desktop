import { useUserStore } from '@/stores/userStore'

// Renderer-side role check — UX ONLY (which buttons to show/hide, which flows to
// gate behind a manager-override dialog). The authoritative enforcement lives in
// the IPC handlers (requireAdmin in electron/auth/session.ts, R1/R2). NEVER rely
// on this to protect data — a determined caller can invoke IPC directly.
export function usePermission() {
  const role = useUserStore((s) => s.current?.role)
  return { role, isAdmin: role === 'admin' }
}
