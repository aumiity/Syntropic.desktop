# IPC API (`window.api`)

| Namespace | Key methods |
|-----------|-------------|
| `pos` | searchProducts, searchCustomers, addCustomer, saveBill, getDailyStats |
| `products` | list, get, create, update, adjustStock, addUnit/updateUnit/deleteUnit, saveLabel/deleteLabel, searchGenericNames, getLots |
| `purchase` | nextGRNumber, save, history, getReceipt |
| `people` | customers CRUD, suppliers CRUD, staff/users CRUD, allSuppliers |
| `reports` | salesList, getSale, voidSale, purchaseList |
| `settings` | shopSettings, updateShopSettings, categories, itemUnits, drugTypes, dosageForms, allLabelLookups, labelSettings, updateLabelSettings |
| `printer` | printReceipt, openCashDrawer |
| `auth` | listLoginUsers, login, logout, resetAdminPassword |

Handlers live in `electron/ipc/*.ts`; bridge in `electron/preload.ts`.

## `auth` (login)

- `listLoginUsers()` → `{ id, name, role }[]` of non-disabled users. **Never returns email/password/hash** (PII off the Login screen).
- `login(userId, password)` → `{ id, name, role }` on success (safe fields only). Throws `Error('LOCKED')` (with a `remainingMs` field) when the account is in brute-force backoff, `'รหัสผ่านไม่ถูกต้อง'` on a bad password. Password hash never leaves main; legacy plaintext (seed) is upgraded to a scrypt hash on first successful login. On success the main process **binds a session** for this renderer (see below). No session is persisted — the renderer holds `current` in-memory only (`userStore`).
- `logout()` → clears the main-side session for this renderer. Called by `userStore.logout()` AND `userStore.lock()` (a lock must drop the main session too, or a re-login as another role would inherit the old role).
- `resetAdminPassword(recoveryCode, newPassword)` → `{ recoveryCode }` (the freshly regenerated plaintext, shown **once**). Self-service admin password reset (no login needed; does NOT bind a session). Verifies the recovery code against a **separate** lockout counter (`recovery_failed_attempts`/`recovery_locked_until`) from login. Resets ONLY the admin's password — never touches shop data. Throws `'รหัสกู้คืนไม่ถูกต้อง'` / `Error('LOCKED')`.

## Main-side session + role enforcement (BL-1, R1/R2)

`electron/auth/session.ts` keeps an in-memory `Map<webContents.id, {userId, role}>` — the authoritative caller identity. `auth:login` binds it; `auth:logout` + a reload/navigate/`destroyed` (wired in `main.ts`) clear it. Never persisted.

`requireAdmin(e, override?)` is the gate, called as the **first line** of admin-only handlers:
- session role `'admin'` → pass.
- else if `override = {userId, password}` supplied → verify inline (admin row + scrypt, same lockout as login). Pass on match, else throw. **Manager-override** for the 4 override-eligible actions.
- else → `throw new Error('FORBIDDEN')` (renderer maps to a Thai toast).

**Override-eligible handlers** (staff sees the button → manager-override dialog): `reports:voidSale`, `products:updatePrice`, `products:adjustStock`/`adjustLot`/`adjustLotBatch`/`updateLot`/`expireLot`, `purchase:cancel`. Each takes a trailing optional `override` arg forwarded to `requireAdmin`.

**Admin-only, hidden (no override):** all finance reports (`reports:financeSummary`/`salesPurchaseTrend`/`accountsPayable`/`topProducts`/`topSuppliers`/`cashierLeaderboard`/`salesStats`/`productVelocity`), `expenses:*`, `people:listStaff`/`saveStaff`/`setStaffStatus`, settings **writes** (`saveShop`/`save*Settings`/`saveCategory`/`saveUnit`/`saveDrugType`/`reorderCategories`/`saveTheme*`), backup writes (`export`/`restore`/`saveSettings`/`pickFolder`/`resetFolder`). Settings/backup **reads** and `completeSetup` are NOT gated.

Renderer side: `usePermission()` (`isAdmin`) gates UX only; `useManagerOverride()` wraps an action so admins run it directly and staff get the `ManagerOverrideDialog`. **Hiding a button is UX — the IPC gate is the real enforcement.**
