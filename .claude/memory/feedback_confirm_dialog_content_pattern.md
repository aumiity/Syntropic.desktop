---
name: feedback_confirm_dialog_content_pattern
description: Canonical body style for ConfirmDialog — structured info-card in the `content` slot, not text in `description`
metadata:
  type: feedback
---

The **canonical** way to render a confirmation/delete dialog body is the `ConfirmDialog` component (`src/components/ui/confirm-dialog.tsx`) with a structured **info-card in the `content` slot** — NOT prose stuffed into `description`.

**Why:** User explicitly stated they love this layout and want it as the main pattern (2026-06-04). `content` is the `w-full text-left` block; `description` is centered muted prose meant for one-liners only. Structured label/value data belongs in `content`.

**How to apply** — copy the reference in `src/pages/Manage/NegativeStock.tsx` (also `Reports/Dashboard.tsx`):

```tsx
content={target && (
  <div className="space-y-3">
    {/* info card: rounded-xl border bg-card shadow-sm, flex label/value rows */}
    <div className="rounded-xl border bg-card shadow-sm p-3 space-y-2 text-sm">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-muted-foreground shrink-0">เลขที่</span>
        <span className="font-semibold">{target.no}</span>
      </div>
      {/* ...more rows... */}
    </div>
    {/* warning/explanation note: borderless tinted-soft box matching the variant */}
    <div className="rounded-xl bg-destructive-soft p-3 text-sm text-destructive-strong leading-relaxed">
      การลบไม่สามารถย้อนกลับได้
    </div>
  </div>
)}
```

Rules of the pattern:
- Info card = `rounded-xl border bg-card shadow-sm p-3 space-y-2 text-sm`, rows = `flex items-baseline justify-between gap-3` (label `text-muted-foreground shrink-0`, value `font-semibold`). Do NOT use the old `bg-muted px-3 py-2.5` + `<dl>` grid style.
- Warning/explanation note = a **borderless** soft tinted box matching `variant` (`bg-destructive-soft text-destructive-strong`, or `bg-warm text-warm-foreground`, or `bg-success-soft text-success`) — NO border on the note box (user pref 2026-06-04). Don't bury the warning in `description`. (The label/value info card above keeps its `border`; only the explanation note box is borderless.)
- Keep `description` empty (or a single short sentence). Never build JSX blocks inside `description`.
- Use plain `description` text ONLY for dialogs with no structured data (e.g. unsaved-changes, "ยกเลิกแล้วใช้ไม่ได้").

All structured confirm dialogs were migrated to this pattern on 2026-06-04 (UnitsTab ลบหน่วยนับ, Expiry ยืนยันการตัดออก were the last holdouts). Plain-text confirms with no structured data correctly keep using `description` (VoidBillDialog, QuotationList, EditQuotation, EditBundle/index unsaved-changes, EditProduct/index price-warning, ComponentsTab).

Related: [[feedback_dialog_button_convention]], [[feedback_modal_behavior]].
