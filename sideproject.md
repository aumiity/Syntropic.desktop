# Side Project: Invoice Matcher → Power Automate CSV

Brief for the next session — read this top-to-bottom, you'll have full context.

---

## Why this exists

User runs a pharmacy. Day-to-day reality:

- **Hygeia** is the system of record (legacy Access `.mdb`). Schema is heavily interconnected → direct DB import is off the table (user confirmed they investigated and ruled it out).
- User already has **Power Automate** scripts that drive Hygeia's UI keystroke-by-keystroke when receiving stock. Those work fine.
- Power Automate consumes a **CSV with 6 columns**:
  | A | B | C | D | E | F |
  |---|---|---|---|---|---|
  | Barcode | จำนวน | ล็อต | วันผลิต | วันหมดอายุ | ราคารวม |
- The remaining bottleneck: **filling column A (Barcode)** for each invoice line. Today user scans every product with a barcode gun on the physical box — slow for big invoices.
- Suppliers (5 regular ones) use inconsistent product names on their invoices; the names don't match Hygeia's product names either. That's why barcode scanning has been the only reliable identifier so far.

**Goal:** Build a matcher inside Syntropic.desktop that takes the supplier's text (from an invoice line) → returns the correct Hygeia barcode. User then fills qty/lot/exp/price, clicks export, and Power Automate eats the resulting CSV. Should beat barcode-scanning on speed once the alias dictionary is warmed up.

---

## Architecture decisions (already made)

1. **Built into Syntropic.desktop**, not a separate app. Syntropic has the Electron + SQLite + UI stack ready and will eventually replace Hygeia anyway, so this feature has dual value: speeds up Hygeia entry today + bootstraps Syntropic's own GR data tomorrow.

2. **Hygeia's product master = Syntropic's `products` table** (for now). Loaded via the seed pipeline below. User wanted this as seed so it's portable across machines via git. Will be **removed before production compile** — that's why it lives in the fresh-DB block of `seed.ts` instead of being baked deeper.

3. **Alias table is the heart of the system.** `(supplier_id, supplier_text) → product_id`. Grows from human-confirmed first-time matches. Once seen, instant lookup forever after.

4. **4-tier match algorithm:**
   - Tier 1: alias cache (instant exact hit)
   - Tier 2: tokenize + exact match (generic name + strength)
   - Tier 3: fuzzy (Levenshtein/trigram, local — no AI)
   - Tier 4: LLM rerank (defer; only if 1-3 prove insufficient)

5. **AI vision for invoice → text** is a later phase. Start with **paste text** as the input mode — simpler to test the matcher logic in isolation.

---

## What's done so far

### Hygeia products seeded
- `docs/Item.xlsx` (Hygeia export, 2,430 rows) — **canonical source** for the seed pipeline (raw Hygeia columns, read directly).
- `scripts/gen-products.py` — self-contained generator (openpyxl): `docs/Item.xlsx → electron/db/seed-data/products.ts`. Replaced the old `gen-products.mjs` (which read a lossy intermediate `docs/Item.json`). Re-run: `python scripts/gen-products.py`.
- `electron/db/seed-data/products.ts` — auto-generated tuple array (1,525 rows), bundled into `main.js`.
- `electron/db/seed.ts` — imports `PRODUCTS`, inserts in the fresh-DB block.
- 32 `item_units` added in seed.ts (superset of everything Hygeia uses: ห่อ, กระปุก, กระป๋อง, ม้วน, ตลับ, ก้อน, AMP, แกลลอน, etc.).
- 5 suppliers seeded: VMDRUG, DRUG CENTER, WELLEKPHARMA, FORTE, LIKHIT.

### Field mapping (Hygeia Item.xlsx → Syntropic products)
| Hygeia | Syntropic | Notes |
|---|---|---|
| Code | code | keep `IT-XXXX` as-is |
| Name | trade_name | |
| OtherName | search_keywords | generic name → matcher uses this |
| BarCode, BarCode2/3/4 | barcode, barcode2/3/4 | |
| SaleUnitName | unit_id | resolved via item_units; falls back to 'ชิ้น' if unknown |
| round(MovAvgPrice,4) else UnitPrice | cost_price | weighted-avg preferred; fallback when MovAvg 0/blank |
| SalePrice | price_retail | |
| Wholesale1/2 | price_wholesale1/2 | |
| IsDisabled / IsHidden / IsStockItem | is_disabled / is_hidden / is_stock_item | |
| NameForPrint | name_for_print | |
| IsTax | has_vat | |
| Note | note | |
| TMTID | tmt_id | |
| ReorderPoint | reorder_point | seed: `> 0 ? value : null` |
| QtyReq | safety_stock | seed: `> 0 ? value : null` |
| DrugACPCKey != null | is_drug = 1 | ~420 across export; 297 in the 1,525 seeded (non-disabled) set |
| ItemTypeKey, VendorKey, Wholesale3-6, ItemScore, Manufacturer*, BarCode5/6 (empty), etc. | (dropped) | |

### Per-table seed convention
Going forward, when seeding a new table from external data: create a self-contained `scripts/gen-<table>.{py,mjs}` per table (e.g. `gen-products.py`, `gen-customers.mjs`). Don't merge them into one mega-script. Read the authoritative source (xlsx) directly — no lossy intermediate JSON.

### Cleanups done
- `docs/Item.json` — superseded; `docs/Item.xlsx` is now read directly (kept for reference, not in the pipeline)
- `docs/Item.units.json` — deleted (debug file)
- `docs/DrugGenericName.json`, `docs/label_*.json` — deleted (already baked into seed-data/*.ts; no plan to regen)
- Old `scripts/gen-seed-data.mjs` — deleted (split into per-table: `gen-products.py` + `gen-customers.mjs`)

---

## Confirmed format/conventions for CSV export

These came from the user explicitly — preserve exactly:

- **`ล็อต`** = `DDMMYY` derived from the expiry date (string, leading zero preserved — `04` of day-4 must NOT drop to `4`). The user writes this by hand on physical boxes the same way.
- **`วันผลิต` and `วันหมดอายุ`** = `DD/MM/YYYY`. **Both columns get the expiry value** (user uses expiry for both — Hygeia just needs the field filled).
- **`ราคารวม`** = line total (qty × unit cost). NOT unit price. Power Automate enters it directly into Hygeia which then derives unit price.

---

## ✅ Status (updated 2026-05-16)

Jobs 1–6 **all implemented**:
- **Job 1** — `supplier_product_alias` table + `idx_alias_lookup` added to the main CREATE block in `electron/db/schema.ts` (before the Indexes section).
- **Job 2** — `electron/services/matcher.ts`: `matchLines(db, supplierId, lines)` with 3 tiers (alias / token-set F1 / trigram-Dice fuzzy), `normalize()`, plus CSV helpers `formatLot` (DDMMYY), `formatDate` (DD/MM/YYYY), `buildCsv`. NOTE: iterate `Set` with `.forEach` only — the electron tsconfig target rejects `for…of` over Set.
- **Job 3** — `electron/ipc/matcher.ts` (`matchLines`, `saveAliases` upsert, `listAliases`, `exportCSV` via save dialog + UTF-8 BOM buffer). Registered in `electron/main.ts`, exposed in `electron/preload.ts` → `window.api.matcher`.
- **Job 4+5** — `src/pages/PurchaseIntake/index.tsx`: left input column (supplier Select + Textarea + จับคู่ button, 600ms debounced auto-match) / right table-card (confidence tint + Badge, per-row product override search via `pos.searchProducts`, validates then saves aliases then exports CSV).
- **Job 6** — route `/purchase-intake` in `App.tsx`; sidebar item "จับคู่ใบส่งของ" (`ScanLine` icon) after การซื้อ.

Both typechecks pass for the new files (`tsc -p tsconfig.node.json` clean; renderer errors are all pre-existing in EditProduct/dialog/themeStore, none in the new files). **Not yet runtime-tested in `npm run electron:dev`** — that's the first thing to do next session.

### Open decisions — RESOLVED (user, 2026-05-16)
1. Auto-confirm threshold = **0.95** (`AUTO_CONFIRM_THRESHOLD` in matcher.ts).
2. Barcode fallback = **yes, barcode → barcode2 → 3 → 4** (`resolveBarcode`).
3. Empty supplier_text rows = **skip silently** (handled in `matchLines`).
4. qty = whatever the user types; every CSV field is quoted (qty included).

### Customers seeded (2026-05-16)
- `docs/Person.xlsx` (Hygeia Person export, 171 rows) → parsed (inline-string xlsx, no sharedStrings) and **mapped** into `docs/Person.json` (the post-mapping source for the customers generator). NOTE: products has since moved to reading `Item.xlsx` directly via `gen-products.py`; the customers pipeline still uses the `Person.json` intermediate.
- Dropped 2 Hygeia system rows (negative `PersonKey`); kept **169** real customers. Codes assigned `C0001…C0169` (C0000 = reserved walk-in `ลูกค้าทั่วไป`, seeded separately).
- Field map: `FullName`→full_name, `Cid`→id_card (digits only), `MobilePhone`||`Phone`→phone, `Address`+`Address2`+`ZipCode`→address. **No DOB** (BirthDate column was 100% empty in the export).
- `scripts/gen-customers.mjs` (self-contained, per-table convention) → `electron/db/seed-data/customers.ts` (169 tuples). Wired into `seed.ts` fresh-DB block with the same "temporary dev seed, remove before prod" guard as products.
- `docs/Person.xlsx` kept (raw original) in case the field mapping needs revisiting — unlike Item.xlsx which was deleted. Delete it before prod if not needed.

### Follow-ups / not done
- `matcher:listAliases` has no UI yet (debug/mgmt screen) — IPC exists, page TBD.
- Later phases (AI vision, embeddings, LLM rerank, batch bootstrap) untouched — as planned.

---

## ✅ Status (updated 2026-05-17)

### Runtime test — DONE, end-to-end works
Ran `npm run electron:dev`. Paste → match → export full loop works. CSV is produced via the save dialog.

### Sidebar nav moved
`จับคู่ใบส่งของ` was moved **out of `mainNavItems`** and into `bottomNavItems` as the first entry (above the `CSS`/`Braces` item) in `src/components/layout/Sidebar.tsx`. Rationale (user): it's an auxiliary test feature that may be removed before prod, so it doesn't belong in the main nav. `ScanLine` import still used — no unused import. Main nav is now: การขาย → การซื้อ → สินค้า → บุคคล → รายงาน → ตั้งค่า.

### CSV correctness — VERIFIED CORRECT (the "bug" was Excel, not us)
User opened the exported CSV in Excel and saw barcode as `8.40165E+11` (scientific) and dates as `22/2/2028` (0 stripped), thought it was a bug. Hex-dumped the actual saved file (`Desktop/intake-20260516-235115.csv`) — **the raw bytes are 100% correct per spec**:
- BOM `EF BB BF` present
- Barcode full + intact: `"840164526349"` (Excel only *displays* it as scientific)
- ล็อต `"220228"` — leading-zero-safe DDMMYY
- วันผลิต / วันหมดอายุ both `"22/02/2028"` — zero-padded DD/MM/YYYY, same value (by design)
- ราคารวม `"185"`, CRLF line endings, every cell wrapped in `"`

Conclusion: **no code change needed.** Excel mangles long numbers + dates only on display (double-click open); it does not alter the file. `electron/services/matcher.ts` `buildCsv`/`formatLot`/`formatDate` and the BOM write in `electron/ipc/matcher.ts` are all correct as-is.

### KEY DECISION — Power Automate reads CSV as text, NOT via Excel
The real constraint surfaced: user's Power Automate flow was reading the file **as an Excel file**, which is why values were coerced. **Decision (user): user will modify the Power Automate script to consume the CSV as plain text instead** — so we do NOT write `.xlsx` and do NOT add an xlsx library (which would have risked `npm install` breaking better-sqlite3). Our CSV stays exactly as-is.

PA-side requirement when user resumes: the flow must NOT use an Excel connector ("List rows present in a table" etc.). It must read file content as text → split on CRLF → split each line on `,` → strip the surrounding `"` from each cell. (Data never contains literal quotes, so naive `"`-strip is safe; `""`-unescaping is a non-issue for this dataset but harmless to handle.)

### ▶ NEXT SESSION — resume here
User is editing the Power Automate script to read CSV-as-text. When they return:
1. They test PA with the existing CSV. If values land in Hygeia correctly → this whole export path is **done**, no Syntropic code change.
2. If PA still mangles values, revisit — but the fallback is a PA-side fix, not an xlsx writer, unless the user explicitly changes the decision.
3. Then remaining open work is the later phases (AI vision input, etc.) and the optional `listAliases` mgmt UI.

---

## Next jobs (in order)

### Job 1 — `supplier_product_alias` table

Add to `electron/db/schema.ts`:

```sql
CREATE TABLE IF NOT EXISTS supplier_product_alias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  supplier_id INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  supplier_text TEXT NOT NULL,
  product_id INTEGER NOT NULL REFERENCES products(id),
  confidence REAL NOT NULL DEFAULT 1.0,
  confirmed_by INTEGER REFERENCES users(id),
  confirmed_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  UNIQUE(supplier_id, supplier_text)
);
CREATE INDEX IF NOT EXISTS idx_alias_lookup ON supplier_product_alias(supplier_id, supplier_text);
```

Normalize `supplier_text` before storing: trim, collapse whitespace, uppercase (so "PARA 500" and " para  500 " collide on the same key).

### Job 2 — Matcher service (`electron/services/matcher.ts` — new file)

Pure function `matchLines(supplierId, lines: string[]): MatchResult[]`. Each result = `{ supplierText, candidates: [{productId, barcode, name, score}], tier }`.

Tier sequence:
1. **alias cache** — normalize text, query `supplier_product_alias`. Hit → confidence 1.0, single candidate.
2. **token exact** — tokenize: split on whitespace/punct, lowercase, extract numeric+unit pairs (`500`, `500mg`, `10ml`). Match tokens against `products.trade_name + ' ' + products.search_keywords`. Score = overlap ratio. Take top-N by score.
3. **fuzzy** — only if tier 2 returns nothing or only weak scores. Levenshtein or trigram against the candidate set. Pure JS, no deps.

Return top-3 candidates per line. Caller decides what to display/auto-pick.

### Job 3 — IPC handlers (`electron/ipc/matcher.ts` — new file)

```ts
matcher:matchLines (supplierId, lines[]) → MatchResult[]
matcher:saveAliases (rows: {supplierId, supplierText, productId}[]) → void  // bulk
matcher:listAliases (supplierId) → Alias[]                                  // mgmt/debug
matcher:exportCSV   (rows: ExportRow[]) → { path }   // writes to user-chosen location via dialog
```

Wire into `electron/preload.ts` under `window.api.matcher`.

### Job 4 — UI page `src/pages/PurchaseIntake/index.tsx`

Two-column layout following `bg-card rounded-card shadow-card` conventions. **READ `/theme` SHOWCASE FIRST.**

**Left column:**
- Supplier `<Select>` (lists all suppliers from `people:allSuppliers`)
- `<textarea>` (wrap with the Input styling) for pasting invoice lines, 1 per line
- `<Button>` "จับคู่" (variant `default`)

**Right column = Table-card layout** (follow CLAUDE.md "Standard table-card layout" rules — `bg-card rounded-card`, sticky `bg-muted` headers, etc.):
- Columns: ลำดับ | supplier_text | สินค้า (Combobox, default = top match) | จำนวน | ล็อต (auto from exp) | วันหมดอายุ (DateInput) | ราคารวม
- Confidence highlighting on the สินค้า cell: green ≥ 0.95, yellow ≥ 0.70, red below (needs confirmation)
- `วันผลิต` is NOT shown — it's filled = expiry at export time

**Footer bar** (`h-12 px-5 bg-card border-t border-border`):
- left: "{n} แถว · {confirmed}/{total} match แล้ว"
- right: `<Button variant="default" size="xl">บันทึก alias + ส่งออก CSV</Button>`

Action behavior:
- New text in textarea → debounced auto-`matcher:matchLines`
- User can override สินค้า via Combobox (search by name/barcode)
- On export: any row where user picked a product different from the cached alias (or where there was no cached alias) → save to `supplier_product_alias` first, THEN write CSV.

### Job 5 — CSV export logic (in matcher service or a sibling helper)

For each row, emit:
- `Barcode` = `products.barcode` (fall back to barcode2/3/4 if blank? — TBD with user)
- `จำนวน` = qty (integer or decimal as entered)
- `ล็อต` = format expiry as `DDMMYY` zero-padded string
- `วันผลิต` = expiry as `DD/MM/YYYY`
- `วันหมดอายุ` = expiry as `DD/MM/YYYY` (same value)
- `ราคารวม` = the user-entered line total

CSV format: UTF-8 with BOM (Excel-friendly on Windows), comma-separated, Thai header row matching exactly what Power Automate expects (see screenshot in conversation history if unsure).

### Job 6 — Nav + routing

Add link to the sidebar in `src/components/layout/Sidebar.tsx` (or wherever the nav lives — check first). Probably under a "Purchase" group alongside the existing GR page. Page title: "นำเข้าใบส่งของ" or "จับคู่ใบส่งของ".

### Later (don't do yet)
- AI vision input (drag image/PDF → OCR via Claude API → autofill the textarea)
- Embedding similarity tier (OpenAI `text-embedding-3-small` or local model)
- LLM rerank for ambiguous top-3
- Batch bootstrap mode: feed N old invoice images, build alias table en masse before going live

---

## Open decisions to settle when picking up

1. **Confidence threshold** for auto-confirm vs require-click? Suggest start at 0.95 — anything below = user must click to confirm.
2. **Barcode fallback**: if `products.barcode` is empty but barcode2/3/4 has a value, use that? (Hygeia stores one primary; the user's Power Automate setup likely expects the primary specifically — clarify before coding the fallback.)
3. **Empty supplier_text rows** — skip silently or surface as errors?
4. **What does "qty" mean to Power Automate** — integer pieces or can be decimal? Default to whatever the user types; quote it in the CSV either way.

---

## Resume checklist

1. Read this file.
2. `npm run electron:dev` once. Open Products page — verify ~2,430 rows. Try scanning a real barcode — should match a product. **Do NOT `npm install`** (will break the better-sqlite3 native binary; see CLAUDE.md).
3. Start Job 1: schema migration. Add the `CREATE TABLE` + index inside `initializeSchema()` in `electron/db/schema.ts` (alongside the existing tables, not inside the migration loop at the bottom).
4. Job 2 + 3 next — service first, then IPC wrapper.
5. Job 4 (UI) last — by then you have a real API to wire up.

---

## Reference: house rules (from CLAUDE.md, summarized)

- **Theming:** no Tailwind color literals (`bg-blue-500` etc.) — semantic tokens only (`bg-primary`, `bg-card`, `text-foreground`, etc.). Add new tokens to `:root` + `.dark` in `src/index.css` if missing.
- **UI primitives** from `src/components/ui/` only — never raw `<button>`, `<input>`, `<select>`. Variants are role-based (`default`/`secondary`/`tertiary`/`brand-soft`/`info-soft`/`warm`/`destructive`/`destructive2`/`success`/`ghost`/`outline`).
- **Showcase at `/theme`** is the canonical reference. Match existing patterns; add new pattern there *first* if needed.
- **Dialog contract:** Esc closes, outside-click does NOT close, Enter triggers primary action. Cancel/Close = `variant="destructive2"`.
- **Min text size:** `text-sm` (carve-out: `Badge` may use `text-xs`).
- **Card radius:** `rounded-card` for floating cards/panels; `rounded-lg` / `rounded-control` for controls.
- **Tailwind v3.4.4 — NOT v4.** Arbitrary CSS-var values must use bracketed syntax: `w-[var(--radix-...)]`, never `w-(--radix-...)`.
- **Standard table-card layout** for any list page — see CLAUDE.md section. Bands: top header (`bg-card`, no border) → column header (`bg-muted`, sticky) → body (`bg-card`) → footer status bar (`bg-card border-t border-border`, `h-12`).
- **NEVER `npm install`** without `--ignore-scripts`. Will break better-sqlite3.

---

End of brief. Pick up at "Job 1" when ready.
