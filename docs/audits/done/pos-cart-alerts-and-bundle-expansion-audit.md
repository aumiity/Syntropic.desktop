# Audit: POS Cart — Expiry/Stock Alerts + Bundle Expansion

**Audited:** 2026-05-21
**Plan:** `docs/plans/pos-cart-alerts-and-bundle-expansion.md`

## Summary

The plan is structurally sound — the data flow claims are accurate, the IPC/schema patterns are well-understood, and the implementation breakdown is logical. However, **3 issues must be addressed before implementation**: one wrong claim about Tooltip availability, one CLAUDE.md violation (raw `<button>`), and one CLAUDE.md violation (inline UI component in a page file).

---

## Findings

### 1. Tooltip component EXISTS — plan's claim is wrong

**Severity: Must fix**

The plan states (line 102):

> Tooltip via native `title` attribute (no shadcn Tooltip primitive in the project)

This is false. `src/components/ui/tooltip.tsx` exists and exports `Tooltip`, `TooltipTrigger`, `TooltipContent`, `TooltipProvider` — all wrapping Radix primitives. Using native `title` would violate CLAUDE.md's hard rule: *"Never write raw HTML UI elements. Use `src/components/ui/` components exclusively."*

**Fix:** Replace the `title` attribute approach with `<Tooltip>` + `<TooltipTrigger>` + `<TooltipContent>`. The existing `TooltipProvider` likely wraps the app already (verify in `src/main.tsx` or `src/App.tsx`); if not, wrap the POS page.

**Also:** This means `AlertIcon` should render a `TooltipTrigger` (the icon) wrapped in a `Tooltip` with `TooltipContent` showing the reason text. This makes the inline component slightly less "one-off" — see Finding 3.

### 2. Raw `<button>` for bundle expand toggle

**Severity: Must fix**

The plan proposes a raw `<button>` (lines 113-126) with the caveat:

> Uses raw `<button>` only because this is inside a dense table cell and the Button component's padding/sizing fights the row height

CLAUDE.md is explicit: *"Never write raw HTML UI elements. Use `src/components/ui/` components exclusively."* and *"`<button>` → `<Button variant='...'>` — always, no exceptions"*

**Fix:** Use `<Button variant="ghost" size="icon">` for the expand toggle. Confirmed:
- `size="icon"` exists (→ `size-7`, 28px container) at `button.tsx:94`
- `variant="ghost"` works with `size="icon"`
- If 28px is too tall for the cell, the correct fix is to add a smaller icon size to `button.tsx` (e.g. `size="icon-xs"` → `size-5` already exists at line 95), not to bypass the Button component.

### 3. `AlertIcon` inline component violates page-file rule

**Severity: Must fix**

The plan defines `AlertIcon` as "a small inline render (kept in the same file — it's one-off and tiny, doesn't warrant a new UI primitive)."

CLAUDE.md is explicit: *"No local UI components in page files (HARD). Any JSX helper component defined at module scope inside `src/pages/` is forbidden — no exceptions."*

**Fix:** Since Finding 1 already requires replacing `title` with `<Tooltip>`, the alert icon rendering is no longer "one-off and tiny." Extract `AlertIcon` to `src/components/ui/alert-icon.tsx` as a proper UI primitive, or inline the Tooltip+Icon JSX directly in the cart row (no helper component needed if it's just a few lines of JSX per alert level).

---

## Verified Claims (accurate)

| Claim | Evidence |
|-------|----------|
| `label_settings` at schema.ts:405 | Confirmed — lines 405-424 |
| `getLabelSettings`/`saveLabelSettings` pattern at settings.ts:174-189 | Confirmed — singleton upsert with dynamic `Object.keys()` UPDATE |
| Preload bridge entries at preload.ts:99-103 | Confirmed — same two-line invoke pattern |
| `pos:searchProducts` returns `product.lots[]` FEFO | Confirmed — `ORDER BY CASE WHEN expiry_date IS NULL THEN '9999-99-99' ELSE expiry_date END ASC` at pos.ts:91 |
| `pos:searchProducts` returns `product.bundle_items[].lots[]` FEFO | Confirmed — same ORDER BY at pos.ts:119 |
| `CartItem.product` carries `bundle_items[]` and `lots[]` | Confirmed — `Product` type at types.ts:27-28 |
| `ProductBundleItem` has `component_name`, `component_unit_name`, `qty_per_bundle`, `lots[]` | Confirmed — types.ts:32-46 |
| `SectionCard` exists with `icon`, `title`, `tint`, `right`, `children` props | Confirmed — card.tsx:110-140 |
| `Switch` component exists with `size` and `variant` props | Confirmed — switch.tsx:8-56 |
| `Button size="icon"` and `size="icon-lg"` exist | Confirmed — button.tsx:94, 105 |
| `text-warning` and `text-warning-strong` are valid CSS tokens | Confirmed — index.css:73,77 (light) and 157,161 (dark); used in 28+ files |
| All needed lucide icons exist in the project | Confirmed — `AlertTriangle`, `AlertCircle`, `PackageX`, `ChevronRight`, `ChevronDown` already imported elsewhere; `AlertOctagon` needs first import everywhere |
| No existing cart expand/bundle sub-row state in POS | Confirmed |

## Minor notes

- **Line 957 reference is slightly off.** The delete button is ~line 951-954. The sub-row insertion point needs to be verified against current code during implementation.
- **`LabelSettingsTab` form keys differ from DB column names** (e.g. `paper_width` → `width_mm`). The plan's `sales_settings` uses snake_case columns that map directly to form keys — simpler, no mapping layer needed. This is fine.
- **`AlertOctagon` icon is not imported anywhere yet.** Will need a new lucide-react import in POS/index.tsx.
- **`PackageX` and `AlertCircle` are also not in POS/index.tsx imports.** They need to be added to the existing import block at lines 23-29.
- **`ChevronDown`, `ChevronRight` are already imported in POS/index.tsx** — no new icon imports needed for the expand toggle.

## Recommendations

1. Use `<Tooltip>` + `<TooltipTrigger>` + `<TooltipContent>` instead of `title` attribute.
2. Use `<Button variant="ghost" size="icon">` (or `size="icon-xs"` if height is tight) instead of raw `<button>`.
3. Either extract `AlertIcon` to `src/components/ui/alert-icon.tsx`, or inline the `<Tooltip>`/icon JSX per alert level directly in the cart row without a helper component.
4. Otherwise the plan is ready to implement — data flow, schema, IPC, and type claims are all verified against the codebase.
