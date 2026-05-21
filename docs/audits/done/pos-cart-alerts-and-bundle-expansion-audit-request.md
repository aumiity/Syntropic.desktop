# Audit Request — POS Cart Expiry/Stock Alerts + Bundle Expansion

> **For external code-reviewing LLMs (Deepseek, Gemini, etc.) reviewing the implemented feature.**
> Status: code-complete, `tsc --noEmit` clean on both `tsconfig.json` (renderer) and `tsconfig.node.json` (electron), **NOT click-tested yet**.
> Pre-audited at the **plan stage** by 2 reviewers (Claude Sonnet + Gemini) — every finding folded into the plan before code was written.
> This request asks you to audit the **shipped code** against the plan, and to find anything the plan missed.

---

## What this feature does

Two changes to the POS cart:

1. **Per-row alert icons** in front of the product name when the cart row matches any of four conditions:
   - 🔴 **expired** — soonest open lot's `expiry_date < today` (`AlertOctagon`, red)
   - 🔴 **low_stock** — cart qty (normalized to base units via `qty_per_base`) > total open-lot stock (`PackageX`, red)
   - 🟠 **danger** — soonest open lot expires within `expiry_danger_months` (default 3) (`AlertTriangle`, orange)
   - 🟡 **warn** — soonest open lot expires within `expiry_warn_months` (default 6) (`AlertCircle`, yellow)

   Severity is highest-wins. Each level has independent on/off flags. Hover the icon → `<Tooltip>` shows the reason in Thai (e.g. "ใกล้หมดอายุ (12/08/2026)" or — for bundles — "Paracetamol ใกล้หมดอายุ (12/08/2026)").

2. **Bundle expansion** on the cart row's `#` cell — for `is_bundle=1` rows the cell becomes a chevron button (`▸` / `▾`). Click to reveal read-only sub-rows listing each component's `component_name`, `component_unit_name`, and `qty_per_bundle × cart_qty`. Pricing/discount/qty remain on the parent row.

Both are configurable in a new **Settings → การขาย** tab (singleton table `sales_settings`, mirrors the existing `label_settings` pattern). The settings table is intentionally over-provisioned for future POS options (rounding, default discount, etc.) — only the 5 alert-related columns exist today.

## Tech stack
Electron 31 + React 18 + TypeScript + better-sqlite3 + Tailwind v3 + Zustand + Radix UI. `dayjs` already in deps.

## Working tree to review
No commit yet — review the dirty tree. Relevant changes only:
```
electron/db/schema.ts            (added CREATE TABLE sales_settings)
electron/ipc/settings.ts         (added 2 IPC handlers)
electron/preload.ts              (added 2 bridge methods)
src/types/index.ts               (added SalesSettings interface)
src/pages/POS/cartAlerts.ts      (NEW — pure helper)
src/pages/Settings/SalesTab.tsx  (NEW — tab UI)
src/pages/Settings/index.tsx     (registered the tab)
src/pages/POS/index.tsx          (cart row rewrite + state + handlers)
```

## Reference docs
- [`docs/plans/pos-cart-alerts-and-bundle-expansion.md`](../plans/pos-cart-alerts-and-bundle-expansion.md) — full design + plan-stage audit findings (already folded in)
- [`docs/audits/pos-cart-alerts-and-bundle-expansion-audit.md`](pos-cart-alerts-and-bundle-expansion-audit.md) — Claude Sonnet plan-stage audit
- [`docs/audits/pos-cart-alerts-and-bundle-expansion_auditresult_gemini.md`](pos-cart-alerts-and-bundle-expansion_auditresult_gemini.md) — Gemini plan-stage audit
- [`CLAUDE.md`](../../CLAUDE.md) → UI conventions, theming rules, no-raw-HTML rule, no-page-level-helpers rule

---

## Load-bearing assumptions to challenge

These are the architectural pillars. If any is wrong, the design has a hole.

### 1. `product.lots[]` and `bundle_items[].lots[]` from `pos:searchProducts` are FEFO-sorted and only contain *open* lots with `qty_on_hand > 0`
The alert helper trusts this. `soonestLot()` in `cartAlerts.ts` still does a defensive re-pick, but `sumStock()` does **not** filter — it sums every passed lot, assuming the IPC already filtered closed/cancelled ones.

**Verify** in `electron/ipc/pos.ts:59–127` (`pos:searchProducts`) — both branches (regular `lots` and per-component `lots` in `bundle_items`) must filter `is_closed = 0 AND qty_on_hand > 0`.

### 2. Cart qty is in `selectedUnit` units; `qty_per_base` converts to base
This is the critical correction Gemini caught at the plan stage. `cartAlerts.ts` does:
```ts
const factor = item.selectedUnit?.qty_per_base ?? 1
const soldBase = item.qty * factor
```
For a base-unit cart line, `selectedUnit` is `undefined` (per CLAUDE.md HARD invariant in "POS Unit Selection Rules"), so factor = 1.

**Verify:** anywhere in `src/pages/POS/index.tsx` that mutates cart `selectedUnit`/`qty` — does it preserve the invariant that `selectedUnit === undefined ⇔ base unit`? In particular `changeCartUnit` (POS unit dialog `id: -1` path).

For bundles, the user-facing qty is always in **bundles** (not components). Component required stock = `item.qty * c.qty_per_bundle`. Bundles don't have a `selectedUnit` per the existing CLAUDE.md rule "Bundles are base-unit-only in v1 — no unit picker".

### 3. `is_bundle = 1` products always come with `bundle_items[]` populated (possibly empty), and components carry `qty_per_bundle` + `lots[]`
If `bundle_items` is missing or `undefined` for a bundle row, the helper returns `null` (no alert) — that's a silent failure mode worth flagging.

**Verify:** `pos:searchProducts` always attaches `bundle_items` for `is_bundle=1` results, even if the bundle currently has 0 components.

### 4. `expandedBundles: Set<number>` is keyed by cart array index; index drift on remove is the ONLY mutation vector
The plan-stage audit caught that `CartItem` has no stable id. The fix: `removeCartItem` (POS/index.tsx) wraps `cart.removeItem` and remaps the Set (drop key === idx, decrement keys > idx).

**Verify there is NO other mutation path** that shifts cart array indices: searches for `cart.removeItem`, `cart.clear`, anything that reorders or splices the cart. If a path exists that bypasses `removeCartItem`, the Set goes stale.

### 5. `TooltipProvider` is mounted at the app root
The cart now renders many `<Tooltip>` instances (one per alerted row). Without a single root provider they'd each spawn their own context.

**Verify** in `src/App.tsx` — `TooltipProvider` wraps the whole tree (per the plan-stage audit's claim, line 45).

---

## Files to audit (with code paths)

### Backend
- `electron/db/schema.ts` — new `sales_settings` table next to `label_settings` (lines ~425–435)
- `electron/ipc/settings.ts` — new handlers `settings:getSalesSettings` + `settings:saveSalesSettings` (after the label-settings block)
- `electron/preload.ts` — `getSalesSettings` / `saveSalesSettings` on `window.api.settings`

### Frontend
- `src/types/index.ts` — `SalesSettings` interface (after `Setting`)
- `src/pages/POS/cartAlerts.ts` — **new file**: severity helper, `dayjs` math, `qty_per_base` normalization, bundle branch
- `src/pages/Settings/SalesTab.tsx` — **new file**: form state + `Toggle framed` + validation (warn ≥ danger)
- `src/pages/Settings/index.tsx` — tab registered between `drugtypes` and `labels`
- `src/pages/POS/index.tsx`:
  - imports updated (icons, `Tooltip*`, `SalesSettings`, `getCartItemAlert`, `alertColorClass`)
  - `salesSettings` state + load `useEffect`
  - `expandedBundles: Set<number>` + `toggleBundleExpand`
  - `removeCartItem` (replaces direct `cart.removeItem(idx); refocusSearch()` calls in the cart row)
  - cart `map` → `flatMap` returning parent row + optional component sub-rows
  - alert icon prefix on product-name cell; chevron toggle on `#` cell for bundles

---

## Focus areas (please rank issues by severity)

🔴 **Critical** (incorrect alerts / data inconsistency):
- **Wrong stock unit comparison** for non-base unit sales. Gemini caught this at plan stage; verify the `qty_per_base` multiply lands on the right side of the inequality.
- **Bundle severity propagation** — for a bundle whose component A is expired AND component B is low-stock, the parent row must show the HIGHER severity (`expired` > `low_stock` > `danger` > `warn`). Verify `SEVERITY` map + `if (!worst || SEVERITY[candidate.level] > SEVERITY[worst.level])` is correct.
- **Settings dynamic UPDATE injection** — `settings:saveSalesSettings` builds `${k} = @${k}` from `Object.keys(rest)`. If a malicious renderer payload (or a future renderer bug) includes a key like `"updated_at = 'x'; DROP TABLE--"`, what happens? (better-sqlite3's named parameters bind safely, but the *column name interpolation* is raw — verify keys can't reach this handler from untrusted input. Renderer is trusted in Electron, but document the threat model.)
- **Expand state going stale** — anywhere in `POS/index.tsx` that calls `cart.removeItem`, `cart.clear`, or otherwise shifts the cart array, bypassing `removeCartItem`, will desync `expandedBundles`. Grep for it.
- **Set capture in `flatMap`** — `cart.items.flatMap((item, idx) => ...)` closes over `expandedBundles.has(idx)` and `salesSettings`. On a state change (toggle expand or load settings), does the cart re-render? (Both are state in the same component, so yes — but verify the `key={idx}` for sub-rows doesn't collide with the parent row's `key={idx}`.)

🟡 **Minor** (UX inconsistency, edge cases):
- **Lots with `expiry_date === null`** — the helper skips them in `soonestLot` (returns null). A product with ONLY null-expiry lots will never trigger an expiry alert. Is that the desired semantic? (Probably yes — old SQL data sometimes has no expiry.)
- **Bundle with zero components** — `getCartItemAlert` returns `null` for an empty `bundle_items` array. Silently. Is a warning needed?
- **Bundle low-stock messaging** — current message: `"สต๊อกไม่พอ: Paracetamol ต้องการ 20 แต่มี 5"`. What unit? It's base units (e.g. เม็ด). Should the message include `c.component_unit_name`? (Yes, probably.)
- **Settings validation** — only checks `warn ≥ danger`. Doesn't check `warn ≤ 36` (Input enforces `max` client-side but client can bypass). Backend has no schema validation either. Worth flagging?
- **Toggle component** — `LabelSettingsTab` uses inline `Toggle label="ตัวหนา" size="sm"`; SalesTab uses `Toggle framed label="..."`. Verify `framed` (without `="input"`) is the right pill style for a settings form (vs. `framed="input"` which is for filter strips). Check `switch.tsx:75–103`.
- **Cart row sub-row `<TableCell colSpan={4}>`** — total table is 8 columns. Sub-row uses 1 + 1 + 1 + 1 + 4 = 8. Verify the math against the header row in POS/index.tsx (originally line ~870).
- **`<Tooltip>` inside `truncate`** — the alert icon sits in a `flex items-center gap-1.5` with the truncating product name. Does `<TooltipTrigger asChild>` + `<span>` interfere with the truncate ellipsis?

🟢 **Suggestion** (code quality / future-proofing):
- **Reuse existing `getExpiryStatus`?** `src/lib/utils.ts:32–39` has `getExpiryStatus` with hardcoded thresholds (30/60 days). Plan deliberately didn't reuse because thresholds are now configurable, but verify the math style (`dayjs(x).diff(dayjs(), 'day')` vs my `dayjs(x).isBefore(today.add(N, 'month'), 'day')`) — both should agree on edge cases.
- **`AlertOctagon` is a new lucide import in POS** — verify no other file already imports it under a different name.
- **`sales_settings` table over-provisioning** — five columns today, designed to grow. Should the IPC validate that incoming keys are in an allow-list, rather than trusting `Object.keys()`? (See the injection concern above.)
- **Magic number** in `cartAlerts.ts`: `SEVERITY` map order. Document why expired > low_stock > danger > warn.
- **Test coverage** — there are no unit tests in this project today, but `cartAlerts.ts` is a pure function ideal for a future test file.

---

## Specific questions for the audit

1. **Unit-conversion correctness:** Walk through `getCartItemAlert` for these scenarios and confirm it triggers correctly:
   - Sell 2 of base unit "ชิ้น" against `lots = [{qty_on_hand: 1}, {qty_on_hand: 0}]` → low_stock? (Yes — 2 > 1.)
   - Sell 1 of "แผง" where `qty_per_base = 10` against `lots = [{qty_on_hand: 5}]` → low_stock? (Yes — 10 > 5. This is the Gemini test case.)
   - Sell 1 of "แผง" where `qty_per_base = 10` against `lots = [{qty_on_hand: 20}]` → no alert? (Correct — 10 ≤ 20.)
   - Bundle of 2 where `qty_per_bundle = 3` for component A, sold in qty 2, component A `lots = [{qty_on_hand: 5}]` → low_stock? (Required 6 > 5. Yes.)

2. **Severity precedence:** A bundle whose component A is expired (`expiry_date = 2024-01-01`) AND component B is sold out (cart_qty × qty_per_bundle > stock) — does the parent show `expired` or `low_stock`? My code says `expired` (severity 4 > 3). Verify against `SEVERITY` map.

3. **`removeCartItem` correctness:**
   - Add 3 items at idx 0, 1, 2 (bundle, regular, bundle).
   - Expand bundles at 0 and 2 → `expandedBundles = {0, 2}`.
   - Call `removeCartItem(1)` (regular).
   - Expected: `expandedBundles = {0, 1}` (the 2 was decremented). Confirm.
   - Call `removeCartItem(0)`.
   - Expected: `expandedBundles = {0}` (the 1 was decremented, the 0 was dropped).
   - Verify the `forEach` in the wrapper handles both branches correctly.

4. **Hidden cart mutations:** Grep `cart.` (zustand store calls) in `src/pages/POS/index.tsx`. Are there any that shift indices besides `removeItem`? `clear`, `replace`, swap operations, etc. If yes, `expandedBundles` must be reset/remapped there too.

5. **Settings reload behavior:** Save settings in the SalesTab while a POS session has cart items. Switch back to POS. Do alerts reflect the new settings? (No — the POS only loads on mount. Out of scope for v1, but worth flagging if it's a bigger UX issue than expected.)

6. **`<TableRow key>` collisions:** In the new `flatMap`, parent row has `key={idx}` and sub-rows have `key={`${idx}-c-${ci}`}`. Are these guaranteed unique within the table body? (Should be — `idx` is the cart array index, `ci` is the component array index, both 0-based, but format string makes them distinguishable.) Will React reconciliation behave correctly when expanding/collapsing?

7. **Tooltip placement:** When the alert icon is inside `flex items-center gap-1.5` with a `truncate` neighbor span, and the row is `[&_td]:py-1` (8px vertical padding) and h-row ~32px — does the tooltip portal escape the cart's `overflow-auto` container? (Radix Tooltip uses Portal, so probably yes, but verify the `TooltipContent` doesn't get clipped.)

8. **`Toggle framed` rendering:** Open `src/components/ui/switch.tsx:75–103` and confirm `framed={true}` (boolean) is a valid prop value. The plan said use `Toggle` over raw `Switch` rows. Is the visual result a pill-bordered row with label-left + switch-right?

9. **Sales settings defaults on a fresh DB:** The IPC handler does `INSERT INTO sales_settings DEFAULT VALUES` if no row exists. Verify all 5 columns have `DEFAULT` clauses in `schema.ts` (they do, but confirm). Also confirm the renderer's `DEFAULT_FORM` in `SalesTab.tsx` matches the SQL defaults exactly.

10. **CLAUDE.md compliance audit:**
    - **No raw HTML UI elements** — verify no `<button>`, `<input>`, `<select>` are used in any of the 8 changed files (`Button`, `Input`, etc. only).
    - **No page-level UI components** — `AlertIcon` was inlined as JSX per the plan. Verify there's no module-scope JSX helper component in `src/pages/POS/index.tsx` (other than what existed before).
    - **No color literals** — search the changed files for `bg-red-*`, `text-yellow-*`, etc. Only semantic tokens.
    - **`size-N` for icons inside Button** — verify ChevronDown/ChevronRight use `className="size-3.5"`, not `h-3.5 w-3.5`.
    - **`text-xs` only for sub-content** — sub-rows use `text-xs` for component name/unit/qty (per CLAUDE.md "ข้อความที่รองจากเนื้อหา"). Acceptable?

---

## Out of scope for this audit (please do NOT flag)

- **Click-testing** — not done yet, scheduled by the operator.
- **Settings live-reload** — settings load once on POS mount; reload-after-save is deferred to a future Zustand-store refactor.
- **CartItem stable id** — adding `uid` to CartItem is out of scope; the Set-remap pattern is the documented workaround.
- **Settings for future options** — the plan deliberately ships only 5 columns. Don't propose new options (rounding, discount defaults, etc.) — they're known and deferred.
- **Toast on alert** — alerts are passive icons, not modal/toast. Out of scope to add an interrupting toast.
- **i18n** — Thai-only is acceptable per the project convention.
- **Theme dark-mode visual check** — `text-warning` / `text-destructive` / etc. already have dark-mode tokens; not re-verifying.

---

## Provide feedback as

For each issue:
- **Severity**: 🔴 critical / 🟡 minor / 🟢 suggestion
- **Location**: `path/to/file.ts:LINE-RANGE`
- **What's wrong**: 1–2 sentences
- **Suggested fix**: code snippet or grep-validated alternative
- **Evidence**: the actual lines or grep output (so the operator can verify without re-running your search)

Group findings by file or by severity, whichever flows better for your reasoning. If you find that an entire area is clean, say so explicitly — silence is ambiguous.

If the audit reveals new requirements or design changes that should be made, flag them as **🟣 design feedback** separate from bugs.

---

## Verification cheat sheet

```bash
# 1. Confirm no raw HTML UI elements in the 8 changed files
grep -nE '<(button|input|select|textarea)[ >]' \
  src/pages/POS/index.tsx \
  src/pages/POS/cartAlerts.ts \
  src/pages/Settings/SalesTab.tsx \
  src/pages/Settings/index.tsx

# 2. Confirm no Tailwind color palette literals
grep -nE 'bg-(red|blue|green|yellow|orange|amber|emerald|slate|gray|sky)-[0-9]|text-(red|blue|green|yellow|orange|amber|emerald|slate|gray|sky)-[0-9]' \
  src/pages/POS/index.tsx \
  src/pages/POS/cartAlerts.ts \
  src/pages/Settings/SalesTab.tsx

# 3. List every cart mutation path in POS — anything besides removeItem that shifts indices needs to clear expandedBundles
grep -n 'cart\.' src/pages/POS/index.tsx

# 4. Confirm pos:searchProducts filters open lots (assumption #1)
grep -n 'is_closed\|qty_on_hand' electron/ipc/pos.ts | head -20

# 5. Confirm TooltipProvider is at the app root
grep -n 'TooltipProvider' src/App.tsx

# 6. Confirm all SQL defaults in sales_settings match the DEFAULT_FORM in SalesTab
grep -A 8 'CREATE TABLE IF NOT EXISTS sales_settings' electron/db/schema.ts
grep -A 8 'DEFAULT_FORM' src/pages/Settings/SalesTab.tsx

# 7. Confirm Object.keys()-driven UPDATE pattern matches label_settings exactly
grep -B 2 -A 12 'settings:saveSalesSettings' electron/ipc/settings.ts

# 8. Confirm CartItem has no stable id (justifies the Set-remap pattern)
grep -A 6 'interface CartItem' src/types/index.ts
```

Run any of these to validate or augment your findings. Cite the output in your report.

---

# AUDIT RESULTS (Claude Opus — 2026-05-21)

## Verification Checklist (all 8 pass)

| # | Check | Result |
|---|-------|--------|
| 1 | No raw HTML elements | **CLEAN** — zero matches in all 4 changed renderer files |
| 2 | No Tailwind color literals | **CLEAN** — zero matches |
| 3 | Cart mutation paths | 2 `clearCart` calls (lines 713, 895) identified — see 🟡 Finding 1 |
| 4 | `pos:searchProducts` lot filtering | **CONFIRMED** — `qty_on_hand > 0 AND is_closed = 0` at lines 90, 118 |
| 5 | `TooltipProvider` at app root | **CONFIRMED** — `App.tsx:45` wraps tree, `App.tsx:84` closes |
| 6 | SQL defaults = DEFAULT_FORM | **MATCH** — all 5 columns identical (1, 6, 3, 1, 1) |
| 7 | `saveSalesSettings` IPC pattern | **MATCHES** label_settings exactly — `id, updated_at` destructured off, rest dynamic UPDATE |
| 8 | `CartItem` no stable id | **CONFIRMED** — no `uid`/`id` field on CartItem (types.ts:126-132) |

---

## Findings

### 🟡 Minor

#### 1. `expandedBundles` not reset on `cart.clearCart()`

**Location:** `src/pages/POS/index.tsx:713` and `:895`

**What's wrong:** Two call sites call `cart.clearCart()` without resetting `expandedBundles` to `new Set()`. After the cart empties and the user adds new items, any bundle row whose index was previously in the Set will incorrectly render as expanded with no way to collapse (the old index keys persist even though those items are gone).

**Evidence:**
```
713:      cart.clearCart(); setShowPayment(false); setShowSuccess(true)
895:              onClick={() => { cart.clearCart(); refocusSearch() }}
```

Neither line calls `setExpandedBundles(new Set())`.

**Suggested fix:** Add `setExpandedBundles(new Set())` after both `cart.clearCart()` calls:

```ts
// Line 713 — after successful sale
cart.clearCart(); setExpandedBundles(new Set()); setShowPayment(false); setShowSuccess(true)

// Line 895 — clear cart button
onClick={() => { cart.clearCart(); setExpandedBundles(new Set()); refocusSearch() }}
```

---

### 🟢 Suggestion

#### 2. Bundle low-stock message missing unit name

**Location:** `src/pages/POS/cartAlerts.ts:80`

**What's wrong:** The low-stock alert reason for bundles says `"สต๊อกไม่พอ: ${c.component_name} ต้องการ ${requiredBase} แต่มี ${stock}"` without specifying the unit (e.g. "เม็ด"). The component's `component_unit_name` is available on `c` but unused in the alert reason. For a regular product, the user can see the unit in the cart row; for a bundle sub-component displayed only in the alert tooltip, the unit is absent.

**Suggested fix:**
```ts
reason: `สต๊อกไม่พอ: ${c.component_name ?? 'องค์ประกอบ'} ต้องการ ${requiredBase} ${c.component_unit_name ?? ''} แต่มี ${stock}`,
```

Note: the same issue applies to the regular product low-stock message (line 106) — also unit-less — but less critical since the unit is visible in the cart row.

#### 3. No server-side validation for `expiry_warn_months` / `expiry_danger_months`

**Location:** `src/pages/Settings/SalesTab.tsx:47` and `electron/ipc/settings.ts:193-205`

**What's wrong:** Client-side validation is limited to (a) `warn >= danger` check before save, and (b) HTML `min={1} max={36}` on Input. A user can bypass these. The IPC handler writes the raw values into the DB with no validation. If negative numbers or extreme values (999) are written, the `dayjs(today.add(N, 'month'))` in `cartAlerts.ts` would produce dates far in the future or past, causing unexpected alert behavior (e.g., everything flagged as `warn`).

Low risk in Electron where the renderer is trusted, but defense-in-depth would add a server-side check.

#### 4. SEVERITY map rationale not documented

**Location:** `src/pages/POS/cartAlerts.ts:54-59`

**What's wrong:** The severity ordering (expired=4 > low_stock=3 > danger=2 > warn=1) is correct but the rationale (why low_stock beats danger?) is not documented as a comment. A future reader might question whether low_stock should really outrank a near-expiry item.

**Suggested fix:** Add a one-line comment:
```ts
// expired is the most urgent; low_stock (can't fulfill) beats near-expiry (can still sell).
const SEVERITY: Record<AlertLevel, number> = {
```

---

## Answers to Specific Questions

### 1. Unit-conversion correctness

All four test cases verified against `cartAlerts.ts:99-108` and `cartAlerts.ts:71-96`:

| Scenario | Expected | Code path | Correct? |
|----------|----------|-----------|----------|
| Base unit, qty=2, stock=1 | low_stock | `soldBase = 2*1 = 2 > 1` ✓ | **Yes** |
| แผง qty_per_base=10, qty=1, stock=5 | low_stock | `soldBase = 1*10 = 10 > 5` ✓ | **Yes** |
| แผง qty_per_base=10, qty=1, stock=20 | no alert | `soldBase = 10 ≤ 20` ✓ | **Yes** |
| Bundle qty=2, component qty_per_bundle=3, stock=5 | low_stock | `requiredBase = 2*3 = 6 > 5` ✓ | **Yes** |

The `qty_per_base` multiplication is on the correct side of the inequality. The `factor = item.selectedUnit?.qty_per_base ?? 1` defaults to 1 for base-unit items (selectedUnit is undefined), and the nullish coalescing `qty_per_bundle ?? 1` protects against missing data.

### 2. Severity precedence

Verified via `cartAlerts.ts:54-59` and `:74-95`. A bundle with component A expired AND component B low-stock:
- First iteration: expired = severity 4, `worst = { level: 'expired', ... }` (line 92-93: `!worst || 4 > SEVERITY[null]` → true)
- Second iteration: low_stock = severity 3, `3 > 4` → false, kept expired
- **Result: expired.** ✓ Correct.

### 3. `removeCartItem` correctness

Verified via `POS/index.tsx:312-321`:

```
Initial: {0, 2}
removeCartItem(1):
  k=0: 0 < 1 → keep 0
  k=2: 2 > 1 → add (2-1)=1
  Result: {0, 1} ✓

removeCartItem(0):
  k=0: 0 == 0 → dropped
  k=1: 1 > 0 → add (1-1)=0
  Result: {0} ✓
```

The algorithm correctly drops the removed index, keeps indices below it, and decrements indices above it. ✓

### 4. Hidden cart mutations

Full grep of `cart.` in `POS/index.tsx`:

| Line | Call | Shifts indices? | Safe? |
|------|------|-----------------|-------|
| 318 | `cart.removeItem(idx)` | Yes | **Wrapped** in `removeCartItem` with Set remap |
| 434 | `cart.addItem(...)` | Appends only | No shift |
| 677, 1272, 1290, 1332 | `cart.setCustomer(...)` | No | Customer change |
| 713, 895 | `cart.clearCart()` | Empties | **BUG** — see 🟡 Finding 1 |
| 722, 732, 2417, 2490 | `cart.updateItem(idx, ...)` | No | In-place update |
| 769 | `cart.setActiveSlot(i)` | No | Slot change |
| 852, 869 | `cart.setSaleType(...)` | No | Type change |

**Two `clearCart` calls do NOT reset `expandedBundles`.** No other hidden mutation paths. ✓

### 5. Settings reload behavior

Confirmed: `salesSettings` loads once via `useEffect([], [])` at POS mount (line 207-210). Settings saved in the SalesTab while POS is open will NOT propagate until the POS page remounts. This is acknowledged as out-of-scope for v1. The UX impact is moderate for a typical pharmacy workflow (settings are "set and forget"), but worth noting.

### 6. `<TableRow key>` collisions

Verified: parent row uses `key={idx}` (number), sub-rows use `key={`${idx}-c-${ci}`}` (string). JavaScript's `===` comparison and React's key matching both distinguish numbers from strings. No collision possible. On item removal, React correctly unmounts the removed idx and all its sub-rows, then re-mounts the shifted rows with new keys. ✓

### 7. Tooltip placement

`TooltipContent` in `src/components/ui/tooltip.tsx:33` renders inside `<TooltipPrimitive.Portal>`, which teleports the content to `document.body`. The tooltip is therefore not constrained by the cart table's `overflow-auto` container. No clipping concern. ✓

### 8. `Toggle framed` rendering

`src/components/ui/switch.tsx:75-103` confirms `framed?: boolean | "input"` is a valid prop. `framed={true}` (boolean) takes the `framed && !frameInput` branch → gets `h-10 px-3 rounded-lg border bg-card border-border`. When `variant="default" || !checked` → neutral frame. Since SalesTab uses `variant="default"` (default), the frame stays neutral regardless of toggle state. This is correct for a settings toggle row — no colored highlight needed. ✓

### 9. Sales settings defaults match

```
SQL:        expiry_alert_enabled=1, expiry_warn_months=6, expiry_danger_months=3, expired_alert_enabled=1, low_stock_alert_enabled=1
DEFAULT_FORM: expiry_alert_enabled:1, expiry_warn_months:6, expiry_danger_months:3, expired_alert_enabled:1, low_stock_alert_enabled:1
```
**Exact match.** ✓

### 10. CLAUDE.md compliance audit

| Rule | Status |
|------|--------|
| No raw HTML UI elements | **CLEAN** — zero `<button>`, `<input>`, `<select>` in changed files |
| No page-level UI components | **CLEAN** — `AlertIcon` is inlined JSX, not a module-scope helper function |
| No color literals | **CLEAN** — only semantic tokens (`text-destructive`, `text-warning-strong`, `text-warning`) |
| `size-N` for icons in Button | **PASS** — `ChevronDown className="size-3.5"`, `ChevronRight className="size-3.5"`. Alert icons use `size-4` (not inside Button) |
| `text-xs` only for sub-content | **PASS** — sub-rows use `text-xs` for component name/unit/qty, which is "ข้อความที่รองจากเนื้อหา" |

---

## Assumption Verifications

### Assumption 1: FEFO-sorted open lots
**CONFIRMED.** `electron/ipc/pos.ts:90` and `:118` both filter `qty_on_hand > 0 AND is_closed = 0` with FEFO ORDER BY. `soonestLot()` in `cartAlerts.ts:16-25` adds a defensive re-pick — redundant but harmless.

### Assumption 2: `selectedUnit === undefined ⇔ base unit`
**CONFIRMED.** `changeCartUnit` (POS/index.tsx:719-728) sets `selectedUnit: isBase ? undefined : unit` where `isBase = unit.id === -1`. Bundles never enter the unit dialog — their unit cell renders a static `<div>` (line 989-993), not a `<Button>`. No path can give a bundle row a `selectedUnit`.

### Assumption 3: `bundle_items` always populated for bundles
**CONFIRMED.** `electron/ipc/pos.ts:103-122` always attaches `prod.bundle_items = items` (the query result, which may be empty array `[]` but never `undefined`) when `is_bundle === 1`.

### Assumption 4: `removeCartItem` is the only index-shifting mutation
**PARTIALLY CONFIRMED.** `removeCartItem` (wrapping `cart.removeItem`) is the only index-shift path covered. `cart.clearCart()` also shifts (empties) indices but is NOT covered — see 🟡 Finding 1.

### Assumption 5: `TooltipProvider` at app root
**CONFIRMED.** `src/App.tsx:5` imports `TooltipProvider`, line 45 wraps the entire tree, line 84 closes.

---

## Summary

| Severity | Count | Items |
|----------|-------|-------|
| 🔴 Critical | 0 | — |
| 🟡 Minor | 1 | `expandedBundles` not reset on `clearCart` |
| 🟢 Suggestion | 3 | Bundle low-stock unit name, server-side validation, SEVERITY comment |

**Overall assessment: The implementation is correct, well-aligned with the plan, and CLAUDE.md-compliant. All 5 load-bearing assumptions verified. One 🟡 bug (expandedBundles stale after clearCart) should be fixed before ship; the rest are polish.**
