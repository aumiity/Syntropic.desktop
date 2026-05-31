# Plan: First-Run Setup Wizard (Phase 1 — VAT / NO-VAT foundation)

## Context (why)

Today VAT is a free on/off toggle in Settings (`sales_settings.vat_enabled` / `vat_rate`,
edited via `SalesTab.tsx`). It can be flipped at any time, which opens a compliance hole: an
operator can disable VAT to ring up one bill without VAT, then re-enable it — e.g. bills 1–10
have VAT, bill 11 has none, bill 12 has VAT again. Invoice numbers (`RC-YYYYMMDD-NNNN`) run
continuously regardless of VAT, so the Thai Revenue Department, when reconciling ภ.พ.30 against
the sales ledger, sees a non-VAT bill wedged into the sequence — read as tax evasion.

Decision reached with the operator:
- **Do NOT fork the program** into separate VAT / NO-VAT builds (double maintenance, divergence).
- VAT must be a **one-time decision made at install**, not a casual daily toggle.
- A VAT shop has VAT baked in from bill #1 and cannot silently turn it off; a NO-VAT shop never
  sees VAT UI.

Separately, the app currently boots straight into the POS on first launch with placeholder shop
data (`'ร้านยา Syntropic'`, empty address/phone from `seed.ts`), so drug labels and receipts
print with missing/incorrect shop identity.

**This plan = Phase 1.** Build a mandatory first-run setup wizard that forces the essential shop
data (name / address / phone — these print on drug labels) plus the one-time VAT decision, before
the program is usable. This is the spine for both the VAT and NO-VAT modes.

### Explicitly out of scope (later phases)
- **Phase 2:** Hide all VAT UI throughout the app when the shop is in NO-VAT mode.
- **Phase 3:** Lock / remove the Settings VAT toggle; build a guarded "upgrade to VAT" flow
  (requires entering registration data + effective date + audit log) so VAT can only be turned on
  through a deliberate, recorded process — never flipped off mid-stream.
- Per-product VAT-exempt classification (not needed — operator confirmed all goods are taxable).
- Admin login / password setup (no real auth system exists yet).

---

## Decisions locked with operator
- **Wizard scope:** shop identity + VAT decision only (not printer/label settings).
- **Required fields in Step 1:** shop name + address + phone (they appear on drug labels).
  License number is optional.

---

## Current-state references (verified)
- DB bootstrap order: `electron/db/index.ts:17-18` runs `initializeSchema(db)` **then**
  `seedDatabase(db)`. Migrations therefore run before the seed inserts the default `settings` row.
- Migration mechanism: arrays of SQL strings executed as `try { db.exec(sql) } catch {}`
  (`schema.ts` ~line 712 and others) — every statement runs on **every** launch with errors
  swallowed. So `ALTER ... ADD COLUMN` self-heals (duplicate-column error ignored after first run),
  but any unconditional `UPDATE` re-runs every launch and must be made self-idempotent by its
  `WHERE` clause.
- `settings` table: `schema.ts:21-30`. Columns: `shop_name`, `shop_address`, `shop_phone`,
  `shop_license_no`, `shop_tax_id`, `shop_line_id`, `shop_branch` (added via migration at ~709),
  `updated_at`.
- VAT lives in `sales_settings` (`vat_enabled INTEGER DEFAULT 0`, `vat_rate DEFAULT 7`), read by
  POS at sale time (`src/pages/POS/index.tsx:688-689`) and snapshotted per-sale into
  `sales.total_vat` / `sale_items.unit_vat`. (Confirmed: historical bills are not retroactively
  re-VATed — VAT is a per-sale snapshot.)
- Shop settings IPC: `settings:getShop` / `settings:saveShop` (`electron/ipc/settings.ts:87-100`),
  `saveShop` builds a dynamic `Object.keys()` UPDATE.
- Sales settings IPC: `settings:getSalesSettings` / `settings:saveSalesSettings`
  (`settings.ts:198-...`) using an ensure-row-then-UPDATE singleton pattern.
- Preload `settings` namespace: `electron/preload.ts:98-...` (+ `preload.d.ts`).
- App boot / routing: `src/App.tsx` (`HashRouter` → `Layout` → routes; `index` route = POS;
  `hydrateUser()` on mount via `userStore`).
- `Setting` type: `src/types/index.ts:133-137`.
- 13-digit tax-id validation already exists in the full tax-invoice buyer dialog
  (`TaxInvoiceBuyerDialog`, under `src/components/dialogs/`) — reuse that rule.
- Theme primitives to reuse: `Input`/`Textarea`/`Button`/`Card`/`SectionCard`/`FormField`/
  `DateInput`/`useToast`; `TitleBar` for the frameless window chrome.

---

## Implementation

### 1) Data model — `electron/db/schema.ts`
Add to `settings` in **both** the `CREATE TABLE settings` block (so fresh DBs get them directly)
**and** the migration array (so existing DBs are altered):
- `setup_completed INTEGER NOT NULL DEFAULT 0` — the gate flag
- `setup_completed_at TEXT`
- `vat_registered_date TEXT` — VAT effective date (forward-compat for Phase 3 tax invoices)

Add a **guarded backfill** as one statement in the migration array (runs after all `CREATE TABLE`s).
**Ordering (audit note):** the `ALTER ... ADD COLUMN setup_completed` must come **before** this
`UPDATE` in the array, or the backfill references a column that doesn't exist yet on first run.
```sql
UPDATE settings SET setup_completed = 1, setup_completed_at = datetime('now','localtime')
WHERE setup_completed = 0 AND EXISTS (SELECT 1 FROM sales LIMIT 1);
```
Why this exact condition is correct (the crux — migrations run before seed and on every launch):
- **Existing live install (has sales):** marked complete once; subsequent launches no-op
  (`setup_completed` already 1).
- **Fresh install:** no `settings` row exists at migration time → 0 rows updated; also no sales,
  so even after `seed.ts` inserts the row (default 0) it stays 0 → wizard shows.
- **Fresh install reopened before finishing the wizard** (row exists, `setup_completed=0`, still no
  sales): `EXISTS sales` is false → stays 0 → wizard reappears. Correct — no false-complete.
- **Edge (rare, acceptable):** an existing install that configured the shop but never sold is not
  auto-completed → sees the wizard once with fields pre-filled from existing settings → just confirms.

### 2) Fresh seed — `electron/db/seed.ts`
The fresh-install `settings` INSERT (`seed.ts:56-58`) currently passes the placeholder name
`'ร้านยา Syntropic'`. Change it to insert an empty name (`''`) — or `INSERT INTO settings
DEFAULT VALUES` — so the wizard's required-field validation actually forces the operator to type a
real name (a pre-filled name lets them click straight through). `setup_completed` keeps its DEFAULT 0.

### 3) Backend IPC — `electron/ipc/settings.ts` (+ `preload.ts`, `preload.d.ts`)
Add a dedicated handler **`settings:completeSetup`** that performs everything in **one transaction**
(atomic — never half-complete setup):
- `UPDATE settings` with the shop fields + `setup_completed=1` + `setup_completed_at` +
  `vat_registered_date` (only when VAT chosen).
- UPSERT `sales_settings.vat_enabled` + `vat_rate` reusing the ensure-row-then-UPDATE pattern from
  `saveSalesSettings`.
- Return the latest `settings` row.

Rationale for a new handler vs. calling `saveShop` + `saveSalesSettings` separately: atomicity and a
single authoritative "setup done" code path.

Add to the preload `settings` namespace:
`completeSetup: (data: any) => ipcRenderer.invoke('settings:completeSetup', data)` plus the matching
type in `preload.d.ts`. (`saveShop` stays dynamic `Object.keys()`, so the new columns flow through
normal Settings edits too.)

### 4) Types — `src/types/index.ts`
Extend `Setting` (lines 133-137): `+ setup_completed?: number`, `+ setup_completed_at?: string`,
`+ vat_registered_date?: string`.

### 5) Renderer gate — `src/App.tsx`
Wrap the router in a `SetupGate`:
- On mount call `window.api.settings.getShop()`; while loading render `<PageLoader/>`.
- If `setup_completed !== 1` → render `<SetupWizard onComplete={refetch} />` (full-screen, replaces
  the whole app — outside the router/Layout, no sidebar).
- Otherwise render the normal `<HashRouter>…`.
- Keep `hydrateUser()`.

### 6) Wizard UI — new `src/pages/Setup/SetupWizard.tsx`
Multi-step container: local `step` (1..3) + `form` + `onComplete`. Full-screen flex layout with
`<TitleBar/>` on top and a centered Card. Follow theme rules: Thai copy, no emojis, `text-sm`
minimum, Inputs `variant="elevated"`, reuse existing primitives.
- **Step 1 — Shop info:** shop name\*, address\* (Textarea), phone\*, license no. (optional),
  LINE ID (optional). Required = name/address/phone. "Next" blocked + toast + focus on blank
  required field, using the `data-field` + `aria-invalid` pattern from EditProduct.
- **Step 2 — VAT:** two selectable cards "จด VAT" / "ไม่จด VAT".
  - VAT registered → reveal required fields: 13-digit tax id (validate with the exact
    `TaxInvoiceBuyerDialog` rule — `replace(/\D/g, '')` then `/^\d{13}$/`), branch (default
    `'สำนักงานใหญ่'`), VAT rate % (default 7), VAT registration date
    (DateInput), plus a warning: "changing this later requires a special procedure."
  - Not registered → no extra fields.
- **Step 3 — Confirm:** summary → "เริ่มใช้งาน" button → `settings.completeSetup(payload)` → on
  success call `onComplete()` (refetch flips the gate, app loads); on error toast and stay. Reuse
  the existing `PageLoader` (or a matching spinner) for the brief save/transition state.
- Buttons: Back (`variant="elevated"`) + Next / Start (`variant="default"`).

**Storage summary:** `settings` holds shop identity + setup flags + `vat_registered_date`;
`sales_settings` holds `vat_enabled` / `vat_rate` (written by `completeSetup`).

---

## Verification (end-to-end)
1. **Fresh DB:** back up / rename `%APPDATA%/<app>/database/syntropic.db`, run
   `npm run electron:dev` → wizard appears, POS unreachable. Fill name/address/phone; pressing Next
   with one blank → blocked. Choose VAT=registered → 13-digit tax-id validation fires. Finish →
   app loads, Settings shows the data, `sales_settings.vat_enabled` is set. Relaunch → wizard does
   **not** reappear (`setup_completed=1`).
2. **Existing DB with sales:** launch → no wizard. Check `SELECT setup_completed FROM settings` = 1.
3. **Existing DB without sales (simulated):** manually set `setup_completed=0`, ensure no sales →
   wizard appears with fields pre-filled from existing settings.
4. **NO-VAT path:** finish wizard as "not registered" → `vat_enabled=0`, POS has no VAT (as today).
5. **tsc:** type/logic changed, so run `tsc` against both configs and confirm clean.

## Risks / notes
- The backfill `WHERE` clause is the single most important correctness point — it must use a real
  "shop is live" signal (`EXISTS sales`) and never an unconditional `UPDATE`, or fresh installs that
  reopen before finishing the wizard would be falsely marked complete.
- No new npm dependencies → the better-sqlite3 prebuilt-binary constraint is not touched.