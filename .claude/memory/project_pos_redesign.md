---
name: project-pos-redesign
description: "POS page UI polish — bordered cards, cart slot redesign, customer dialogs; paused after customer-info — many sections of POS still untouched"
metadata: 
  node_type: memory
  type: project
  originSessionId: f1822bab-d0b2-46bc-994e-7163c2d2fec5
---

**ACTIVE 2026-05-29, paused mid-flight** — POS page is the heaviest UI surface in the app and getting a top-to-bottom polish pass.

## Done in last session (commit `3acda9b`)

**Main view**
- Bordered cards: cart slot buttons, customer card, cart card (removed explicit `border-0`), daily summary
- Cart table inset `border-l-8` → `border-l-[16px]` to match standard tables app-wide
- Cart card top strip `px-1.5` → `px-4` to align with new 16px inset
- Customer card avatar: warm → primary; action buttons: warm/tertiary → primary-soft/default
- Icons: ShoppingBasket → ShoppingBag; Timer → Hourglass

**Cart slots (top row, 3 slots + customer card)**
- Active highlight: solid `bg-primary` + white text
- iconBox is now single-tone (no per-saleType branching): `bg-primary-soft text-primary` active / `bg-primary text-primary-foreground` inactive
- Badge "ขายปลีก/ขายส่ง" still keys off `saleType` — soft when active, solid when inactive
- iOS-style red notification dot at iconBox corner shows **line item count** (`slot.items.length`) whenever the slot has items — replaces the prior Hourglass-vs-ShoppingBag icon swap AND the "X รายการ" sub line
- Waiting/empty/active states no longer distinguished by icon — only by bg tone + red badge

**Customer search dialog (`showCustomerSearch`)**
- Dialog-convention polish: borders between search row / walk-in / results / footer; Esc + clear-X buttons → `variant="elevated"`
- Walk-in "ลูกค้าทั่วไป" flattened from tertiary-tinted box into the first list row; avatar `bg-primary` like every other row, `tertiary` chip "ค่าเริ่มต้น" is the sole differentiator
- `divide-y divide-border` between rows (rounded-xl pills removed)
- Alert: avatar stays primary always (no red flip), no AlertTriangle corner dot — Badge "แจ้งเตือน" beside name is the sole marker
- Empty state moved below the divide-y wrapper so walk-in stays visible

**Customer info dialog (`showCustomerInfo`)**
- Hero centered (size-24 avatar → name text-2xl → code Badge), inspired by user-supplied profile-card mockup
- Contact rows: keep all 4 (Phone/ID/DOB/Address) with labels; empty → "-" dimmed via `text-foreground-subtle`; SectionCard wrapper dropped (flat)
- Alert: avatar primary, no dot/badge — full alert banner below does the messaging
- Medical SectionCard preserved (domain-critical: chronic diseases + allergy list)

## Done 2026-06-06 (commit `374b2cc`, part of [[project_ui_redesign_pass]] #3)
- **Right rail DONE:** quick-action 5 ปุ่ม `variant="outline"`+ad-hoc → **`variant="elevated"`** (ได้ shadow-sm + hover/active จริง); ไอคอนสีตามบทบาท (เปิดลิ้นชัก=primary, พิมพ์ฉลาก/ตัดสต็อก=info-soft-foreground, รับคืน=warm-foreground, ยกเลิกบิล=destructive); เอา `border border-border` ออกจากกล่องยอดสุทธิ (bg-primary) + ปุ่มชำระเงิน (bg-accent)
- **Cart row inline buttons DONE:** หน่วย/จำนวน/ราคา → **`variant="primary-soft"`**, ส่วนลด(มีค่า+0) → **`variant="destructive2"`** (เดิม outline+ad-hoc soft-bg ที่ hover ไม่เปลี่ยน → ตอนนี้ hover ถูกต้อง); ล้าง double-bg ปุ่มส่วนลด 0. **ค้าง: ปุ่มส่วนลด 0 ยังแดงอ่อน** — เจ้าของอาจอยากให้จาง/นิ่งกว่านี้ตอนยังไม่มีส่วนลด (ถามได้)

## Done 2026-06-09 (commit `2c8457e`) — Return + Adjust modals = unified cart-table

- **Adjust-stock modal (`showAdjust`) rebuilt to MIRROR the return modal**: single column → full-width SearchInput (opens shared `ProductSearchDialog` with per-unit rows) → cart-style `<Table>` → footer total bar → reason band. Old 2-column (search-panel | list-panel) layout deleted.
- **Adjust logic — `recomputeAdjustAllocations` (module fn in POS/index.tsx):** 1 visible row per product+unit; FEFO lot split resolved INTERNALLY (allocations[]) so cost is exact + over-stock caught at add/edit; multi-lot split shown read-only in a tooltip. `AdjustLineItem` reshaped (product + unit_id/qty_per_base + base_qty + allocations[]); confirm payload `flatMap`s allocations → per-lot `{product_id, lot_id, base_qty}`. `adjustLotBatch` IPC unchanged.
- **Unit rule (owner decision):** adjust unit = the SCANNED/SELECTED unit (per-unit search rows like main POS), **not forced base**. No in-table unit picker. Lot stays FEFO-auto (owner: "แทบไม่เคยดูล็อต ระบบกำหนดให้อยู่แล้ว").
- **Return table:** dropped the `ราคา/หน่วย` column (only `รวม`/line_total matters); colSpan 8→7.
- **PITFALL fixed:** search-bar wrapper under the divider used `pt-0` → input's 1px focus `ring` got clipped by `DialogBody overflow-hidden` top edge. Use **`pt-1`** (both return + adjust) — ring shows, still tight. (Don't go pt-0 against an overflow-hidden edge.)
- unit-picker-dialog: trimmed button height (px-4 py-2.5, gap-1.5, title text-xl). ProductSearchDialog default width 1000→800. lot-picker label/badge polish.

## Pending — POS sections NOT touched

- (Right rail + cart inline buttons + Return + Adjust modals = DONE ด้านบนแล้ว)
- Payment dialog (`showPayment`) — large, complex, has its own muted-bg cards
- Quick-add customer dialog (`showQuickAdd`) — simple but uses bare Inputs/Labels (no elevated, no convention polish)
- Product search dialog (`searchOpen`, now 800×800) — palette-style like customer search; may need same divider/elevated polish pass
- Qty modal / price modal / discount modal — various small modals

## How to apply

When resuming, ask user which area next (right rail vs payment vs other dialogs). Don't mass-edit — the user iterates choice-by-choice (saw 20+ back-and-forth tweaks on cart slot alone). Show before/after diffs verbally before committing.

Related: [[project_edit_parity_pass]] is still paused on Tab 2 (ComponentsTab) — different surface but same elevated-everywhere theme this session reinforced.
