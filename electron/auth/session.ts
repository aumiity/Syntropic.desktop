import type { IpcMainInvokeEvent } from 'electron'

// Main-side session — the authoritative caller identity for IPC role enforcement
// (User_Login_System.md §0.6 BL-1, R1/R2). Keyed by webContents.id so each
// renderer frame maps to exactly one logged-in user. In-memory ONLY — never
// persisted: a reload/navigate/destroy clears it (see main.ts wiring), so a
// stale role can never be replayed after the login screen is gone.
type Session = { userId: number; role: string }

const sessions = new Map<number, Session>()

export function bindSession(e: IpcMainInvokeEvent, userId: number, role: string): void {
  sessions.set(e.sender.id, { userId, role })
}

export function clearSession(e: IpcMainInvokeEvent): void {
  sessions.delete(e.sender.id)
}

export function clearSessionById(senderId: number): void {
  sessions.delete(senderId)
}

export function getSession(senderId: number): Session | undefined {
  return sessions.get(senderId)
}

export function getSessionRole(e: IpcMainInvokeEvent): string | undefined {
  return sessions.get(e.sender.id)?.role
}

// Manager-override credential shape, forwarded to a gated IPC call's trailing
// `override` arg and verified server-side by requirePermission (electron/auth/
// permissions.ts). The legacy requireAdmin gate was removed once every call site
// moved to data-driven requirePermission (role-permissions Phase 3).
export type Override = { userId: number; password: string }
