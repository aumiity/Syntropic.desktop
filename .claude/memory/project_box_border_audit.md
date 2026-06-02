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

**DONE so far:**
- PriceSection (both EditProduct + EditBundle): profit box (2-col, border + divide-x) + cost box (border).
- `EditProduct/GeneralTab.tsx`: two `bg-warm/50` stat boxes (สต็อกและการแจ้งเตือน).
- Full app sweep "groups 1+2": `EditProduct/UnitsTab.tsx` (warm cost box + 2× success-soft per-unit profit boxes), `components/dialogs/QuickStockDialog.tsx` (muted + 2× warm), `Purchase/index.tsx` L1475 (primary-soft total), `dialogs/SaleDetailDialog.tsx` + `dialogs/PurchaseReceiptDialog.tsx` (muted info-grids — border only, NOT divider; they're wrapped key-value grids not 2 equal cols), `PurchaseReceiptDialog` cancelled-banner (destructive-soft), `Manage/NegativeStock.tsx` 3 callouts (success/warm/destructive), `Manage/Purchases.tsx` cancel-blockers (destructive-soft).
- Muted boxes use `border border-border` (no accent to tint).
(EditProduct & EditBundle keep TWIN copies of PriceSection/GeneralTab etc — always change both, see [[project_edit_parity_pass]].)

**Deliberately NOT touched (judged intentional):** POS chips/pills/summary tiles (`bg-warm`/`bg-primary-soft` rows in `POS/index.tsx`), Settings preview stages (`bg-muted/30 p-6` in Label/Receipt/DocumentSettingsTab), skeleton loaders, inline badges, `bg-accent` selection-highlight layers, popover hover menu buttons. Revisit only if user asks.

Sweep regex used: `bg-(warm|success-soft|info-soft|primary-soft|warning-soft|...|muted/[0-9]|...)` + `rounded`, minus lines containing `border`. Re-run to catch newly-added boxes.
