---
name: project-column-visibility
description: Active multi-table refactor adding Settings ⚙️ popover with per-column show/hide checkboxes. Shipped on ProductsList + BundlesList; operator wants the same rolled out to other list tables.
metadata: 
  node_type: memory
  type: project
  originSessionId: 9c614f8b-327a-45a0-ac45-92bf28ac5597
---

Active priority started 2026-05-25 (operator paused for sleep, expects to resume next session).

Shipped today on `src/pages/Products/ProductsList.tsx` + `src/pages/Products/BundlesList.tsx`:
- Settings ⚙️ icon-button popover (outline, `h-10 w-10`) in filter strip replaces ad-hoc `Toggle framed` controls.
- Each column toggleable via checkbox; columns conditionally render in header + rows; dynamic `colSpan`.
- ProductsList stock column permanently switched to bar style (`qty + unit + status` over progress bar scaled by `safety_stock`); old number/Badge renderer deleted.
- Price cell shows tooltip with hidden cost/profit when those toggles are off.
- Global sort-icon swap: `ArrowUp/Down/UpDown` → single `ChevronDown` with rotation animation (in `src/components/ui/table.tsx`).
- Removed `"แสดงที่ปิดใช้งาน"` toggle (operator: "ไม่ได้ใช้หรอก"); replaced with derivation from `stockFilter === 'disabled'`.

**Why:** Operator wants dense list tables with per-user control over visible columns, so different roles (cashier vs. owner) see what they need without clutter.

**How to apply:** When asked to "ปรับ" / restyle another list table, default to this same pattern (popover + checkboxes + conditional render + dynamic colSpan). Full implementation notes + open TODOs (which tables to do next, possible shared component extraction) live in PROGRESS.md under the `🚧 PAUSED 2026-05-25` block at the top.

Related: [[theme-tokenization]] (also an in-progress UI sweep).
