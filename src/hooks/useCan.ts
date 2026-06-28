import { useUserStore, type CurrentUser } from '@/stores/userStore'
import { permDefault, type PermState } from '@/lib/permissions/registry'

// Pure resolver (no hook) — same logic as useCan, callable imperatively from
// non-render code (e.g. inside an event handler that already has the store via
// useUserStore.getState()). Keeps the rule in one place.
export function resolveCan(current: CurrentUser | null, key: string): PermState {
  if (!current) return 'off'
  if (current.role === 'owner') return 'allow'
  return current.permissions?.[key] ?? permDefault(current.role, key)
}

// Renderer-side permission resolver — UX ONLY (which buttons/tabs/columns to
// show, and whether an action runs inline vs. behind a manager-override dialog).
// The authoritative enforcement is requirePermission() in main — NEVER rely on
// this to protect data.
//
// Reads the permission snapshot captured at login (current.permissions). owner
// always 'allow'. A missing snapshot entry (or no snapshot at all — e.g. an
// older refresh path) falls back to the registry default for the role. An
// unknown key resolves to 'off' (fail-safe, via permDefault).
//
// Convention at call sites:
//   useCan(key) === 'off'      → hide / block
//   useCan(key) !== 'off'      → show (allow OR override)
//   useCan(key) === 'allow'    → run inline
//   useCan(key) === 'override' → route through useManagerOverride
export function useCan(key: string): PermState {
  const current = useUserStore((s) => s.current)
  return resolveCan(current, key)
}
