// Permission registry — the single source of truth for "who can do what".
//
// Pure data + helpers, importable by BOTH the renderer (UX gating via useCan)
// and the Electron main process (enforcement via requirePermission). NO React /
// DOM imports — this file is bundled into the main process too (precedent:
// electron/db/seed.ts imports src/lib/label/sections; electron/ipc/env.ts
// imports src/lib/env/thresholds). The vite main `external` list stays
// ['better-sqlite3','electron','exceljs'] — this module must remain bundlable.
//
// Permissions are stored per (role × key) in the DB table `role_permissions`.
// The owner role is NEVER stored — it implicitly passes every gate. Only the
// EDITABLE_ROLES (pharmacist, staff) have rows; a missing row falls back to the
// registry default here.

export type PermState = 'off' | 'allow' | 'override'
export type Role = 'owner' | 'pharmacist' | 'staff'
export type PermKind = 'action' | 'view'

export interface PermDef {
  key: string
  group: string
  label: string
  kind: PermKind
  // Registry default state for each editable role.
  pharmacist: PermState
  staff: PermState
}

// The two roles whose permissions are data-driven + editable in the matrix.
// `owner` is intentionally excluded — it is full + locked, never stored.
export const EDITABLE_ROLES: Role[] = ['pharmacist', 'staff']

// 15 permissions, grouped by job area. View permissions only support off|allow
// (no "ต้องขออนุมัติ" — you can't approve a read on the fly). Action permissions
// support all three states.
//
// permission.manage is owner-only (both editable roles 'off') and is NOT rendered
// as an editable matrix row — it gates the permissions Settings tab itself.
export const PERMISSIONS: PermDef[] = [
  // สินค้า/สต็อก
  { key: 'product.editPrice', group: 'สินค้า/สต็อก', label: 'แก้ราคาสินค้า',      kind: 'action', pharmacist: 'allow', staff: 'override' },
  { key: 'stock.adjust',      group: 'สินค้า/สต็อก', label: 'ปรับสต็อก/ล็อต',     kind: 'action', pharmacist: 'allow', staff: 'override' },
  { key: 'purchase.cancel',   group: 'สินค้า/สต็อก', label: 'ยกเลิกใบรับของ',     kind: 'action', pharmacist: 'allow', staff: 'override' },
  { key: 'cost.view',         group: 'สินค้า/สต็อก', label: 'เห็นต้นทุน',         kind: 'view',   pharmacist: 'allow', staff: 'off' },
  // การขาย
  { key: 'sale.void',         group: 'การขาย',       label: 'ยกเลิกบิล (void)',   kind: 'action', pharmacist: 'allow', staff: 'override' },
  { key: 'sale.editCustomer', group: 'การขาย',       label: 'เปลี่ยนลูกค้าในบิล', kind: 'action', pharmacist: 'allow', staff: 'override' },
  // รายงาน/เงิน
  { key: 'report.finance',    group: 'รายงาน/เงิน',  label: 'ดูรายงานการเงิน',    kind: 'view',   pharmacist: 'allow', staff: 'off' },
  { key: 'report.vat',        group: 'รายงาน/เงิน',  label: 'ดูรายงานภาษี VAT',   kind: 'view',   pharmacist: 'allow', staff: 'off' },
  { key: 'export.finance',    group: 'รายงาน/เงิน',  label: 'ส่งออก Excel การเงิน', kind: 'action', pharmacist: 'allow', staff: 'off' },
  // ค่าใช้จ่าย
  { key: 'expense.manage',    group: 'ค่าใช้จ่าย',   label: 'จัดการค่าใช้จ่าย',   kind: 'action', pharmacist: 'allow', staff: 'off' },
  // ระบบ
  { key: 'user.manage',       group: 'ระบบ',         label: 'จัดการพนักงาน/ผู้ใช้', kind: 'action', pharmacist: 'off', staff: 'off' },
  { key: 'settings.manage',   group: 'ระบบ',         label: 'ตั้งค่าร้าน/ระบบ',    kind: 'action', pharmacist: 'off', staff: 'off' },
  { key: 'data.backup',       group: 'ระบบ',         label: 'สำรอง/กู้คืนข้อมูล',  kind: 'action', pharmacist: 'off', staff: 'off' },
  { key: 'vat.toggle',        group: 'ระบบ',         label: 'เปิด/ปิดโหมด VAT',    kind: 'action', pharmacist: 'off', staff: 'off' },
  // Owner-only — gates the permissions matrix itself. Never an editable row.
  { key: 'permission.manage', group: 'ระบบ',         label: 'จัดการสิทธิ์',        kind: 'action', pharmacist: 'off', staff: 'off' },
]

const BY_KEY: Record<string, PermDef> = Object.fromEntries(PERMISSIONS.map((p) => [p.key, p]))

// Keys that appear as editable rows in the Settings matrix (everything except
// the owner-only permission.manage gate).
export const MATRIX_KEYS: string[] = PERMISSIONS.filter((p) => p.key !== 'permission.manage').map((p) => p.key)

export function getPermDef(key: string): PermDef | undefined {
  return BY_KEY[key]
}

export function isPermKey(key: string): boolean {
  return key in BY_KEY
}

export function isViewPerm(key: string): boolean {
  return BY_KEY[key]?.kind === 'view'
}

// Allowed states for a given key, honouring its kind (view → off|allow only).
export function allowedStates(key: string): PermState[] {
  return isViewPerm(key) ? ['off', 'allow'] : ['off', 'allow', 'override']
}

// The registry default state for a (role, key) pair. owner is always 'allow';
// an unknown key is 'off' (fail-safe). This is the value used when no DB row
// exists for an editable role.
export function permDefault(role: string, key: string): PermState {
  if (role === 'owner') return 'allow'
  const def = BY_KEY[key]
  if (!def) return 'off'
  if (role === 'pharmacist') return def.pharmacist
  if (role === 'staff') return def.staff
  return 'off'
}
