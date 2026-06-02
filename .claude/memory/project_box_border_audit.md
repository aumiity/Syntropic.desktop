---
name: project_box_border_audit
description: In-progress sweep adding borders to borderless tinted info/stat boxes for visual consistency (EditProduct/EditBundle done, more pending)
metadata:
  type: project
---

**ACTIVE 2026-06-02, paused.** Sweeping the app for tinted info/stat boxes that have a soft background but NO border, and adding a matching border (and column divider where the box is a 2-col grid) so they read as framed cards. User is hunting these down — "ยังมีซ่อนอยู่อีกหลายที่".

**Convention established:** border color = the box's own accent token at low opacity (NOT border-border). Matches the bg tone:
- `bg-success-soft/50` box → `border border-success/30`
- `bg-warm/50` box → `border border-warm-foreground/25` (warm itself is too light to show; use warm-foreground)
- 2-column boxes also get `divide-x divide-{accent}/30`; move `px-3 py-2` from the container ONTO each cell so the divider has equal padding both sides.

**DONE:** profit box (กำไร | กำไร% — 2 col, border + divider) and cost box (ต้นทุน/ทุนเฉลี่ย — border only, not 2-col) in BOTH:
- `src/pages/Products/EditProduct/PriceSection.tsx`
- `src/pages/Products/EditBundle/PriceSection.tsx`
(EditProduct & EditBundle keep TWIN copies of PriceSection/GeneralTab etc — always change both, see [[project_edit_parity_pass]].)

**Candidates still to check (borderless tinted boxes seen nearby):**
- `EditProduct/GeneralTab.tsx` ~L235-248: two `bg-warm/50` stat boxes (เฉลี่ย/เดือน, เดือนปัจจุบัน) — no border yet.
- `GeneralTab.tsx` sales-history dialog `bg-muted/40` list (L500).
- Sweep other pages (POS, Reports, Manage, Settings) for `bg-*-soft/` or `bg-warm/` / `bg-muted/` boxes without `border`.

**Uncommitted** as of pause: the 2 PriceSection files above (not yet committed — user said save progress, not commit). Also still uncommitted from earlier today, separate task: quotation print template iteration may be ongoing.
