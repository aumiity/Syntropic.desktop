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

## Pending — POS sections NOT touched

- Right rail: total card (bg-primary), Pay button (bg-accent), quick-action buttons (เปิดลิ้นชัก/พิมพ์ฉลาก/ตัดสต็อก/รับคืน/ยกเลิกบิล) — `variant="outline"` with `bg-card` ad-hoc styling; may want elevated pattern
- Payment dialog (`showPayment`) — large, complex, has its own muted-bg cards
- Quick-add customer dialog (`showQuickAdd`) — simple but uses bare Inputs/Labels (no elevated, no convention polish)
- Return dialog (`showReturn`), adjust-stock dialog (`showAdjust`) — both spreadsheet-y
- Product search dialog (`searchOpen`, 1000×800) — palette-style like customer search; may need same divider/elevated polish pass
- Unit picker / qty modal / price modal / discount modal — various small modals
- Cart row inline buttons (unit/qty/price/discount) — still use ad-hoc soft-bg styling; may want elevated parity with rest of app

## How to apply

When resuming, ask user which area next (right rail vs payment vs other dialogs). Don't mass-edit — the user iterates choice-by-choice (saw 20+ back-and-forth tweaks on cart slot alone). Show before/after diffs verbally before committing.

Related: [[project_edit_parity_pass]] is still paused on Tab 2 (ComponentsTab) — different surface but same elevated-everywhere theme this session reinforced.
