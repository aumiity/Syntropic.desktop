# IPC API (`window.api`)

| Namespace | Key methods |
|-----------|-------------|
| `pos` | searchProducts, searchCustomers, addCustomer, saveBill, getDailyStats |
| `products` | list, get, create, update, adjustStock, addUnit/updateUnit/deleteUnit, saveLabel/deleteLabel, searchGenericNames, getLots |
| `purchase` | nextGRNumber, save, history, getReceipt |
| `people` | customers CRUD, suppliers CRUD, staff/users CRUD, allSuppliers |
| `reports` | salesList, getSale, voidSale, purchaseList, vatSummary |
| `settings` | shopSettings, updateShopSettings, categories, itemUnits, drugTypes, dosageForms, allLabelLookups, labelSettings, updateLabelSettings, getBarcodeStickerSettings/saveBarcodeStickerSettings, getPriceTagSettings/savePriceTagSettings, upgradeToVat |
| `printer` | printReceipt, openCashDrawer |
| `auth` | listLoginUsers, login, logout, resetAdminPassword |

Handlers live in `electron/ipc/*.ts`; bridge in `electron/preload.ts`.

- `pos:searchProducts(query)` — searches `p.trade_name/p.barcode/barcode2-4/p.code/p.search_keywords` **and** `product_units.barcode` (so a scanned unit/pack barcode resolves), and returns `matched_unit_id` (the `product_units.id` whose barcode exactly equals the raw query, else null). The renderer uses `matched_unit_id` to pre-highlight that unit's row in `ProductSearchDialog` via the `initialIdx` prop (base row still stays first — no reordering). Channel signature unchanged (one query arg); additive for all existing consumers.

## VAT-specific handlers (2026-06-10)

- `settings:upgradeToVat({tax_id, branch, vat_rate, effective_date})` — admin-only upgrade to VAT-registered mode. Validates 13-digit tax id + rate + date; writes `settings` (tax id/branch/registered date) + `sales_settings.vat_enabled=1` + a `vat_audit_log` row in one tx. Throws if already VAT.
- `settings:downgradeFromVat({password, reason})` — admin-only guarded downgrade. Re-verifies the **logged-in admin's own password** (scrypt + login lockout backoff; throws `'LOCKED'` with `remainingMs`) and requires a reason; sets `vat_enabled=0` + audit row (`action='downgrade'`, reason) in one tx. Keeps registration data in `settings`; never touches old bills.
- `settings:hasVatHistory()` → boolean — any VAT bills / input-VAT GRs / vat_audit_log rows exist. Drives the Reports ภาษี tab visibility for downgraded shops.
- `settings:saveSalesSettings` **strips `vat_enabled`/`vat_rate` main-side** — VAT mode can never be flipped through the generic save, even by a crafted payload.
- `reports:vatSummary({date_from, date_to})` — admin-only. Returns `{output, input, net_vat, sales_rows, purchase_rows, expense_rows}` for the ภาษีขาย/ภาษีซื้อ/ภ.พ.30 report (`/reports/vat`).
- `purchase:save` accepts `vat_mode` (`'none'|'inclusive'|'exclusive'`, per bill) + `vat_rate`; forces `'none'` when the shop is NO-VAT. See `business-logic.md` → VAT for the cost rule.

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

> **Carve-out — `settings:saveBarcodeStickerSettings` / `settings:savePriceTagSettings` are NOT admin-gated** (intentional exception to "settings writes admin-only"). These store only the barcode-sticker / price-tag print-page layout preference (preset + content toggles), a shop-floor operational setting that **staff** are the primary users of, with no financial/security impact. The print tab **auto-persists** on every config change — gating them would spam staff with FORBIDDEN toasts. A matching comment sits on both handlers in `electron/ipc/settings.ts`. Printer + paper size are NOT stored here (read from `label_settings` / `document_settings`).

Renderer side: `usePermission()` (`isAdmin`) gates UX only; `useManagerOverride()` wraps an action so admins run it directly and staff get the `ManagerOverrideDialog`. **Hiding a button is UX — the IPC gate is the real enforcement.**
