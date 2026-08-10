---
name: table-card-scrollbar-inset
description: 2026-08-10 table side inset swept app-wide — border on <table> (l-16/r-6) + mandatory [scrollbar-gutter:stable], scrollbar flush at card edge
metadata:
  type: project
---

**Table-card side inset — the ONE shape (swept app-wide 2026-08-10, 26 files):**

```
wrapper  …[&>[data-slot=table-container]]:overflow-auto
         …[&>[data-slot=table-container]]:scrollbar-thin
         …[&>[data-slot=table-container]]:[scrollbar-gutter:stable]   ← mandatory
<Table>  className="border-l-[16px] border-r-[6px] border-card"
```

`6px` right + `10px` scrollbar lane = the same **16px** as the left. **Do NOT "correct" `border-r` to 16** — that makes the right gap 26px whenever the scrollbar shows. The scrollbar sits flush at the card's outer edge.

**`[scrollbar-gutter:stable]` is not optional.** A classic scrollbar takes real layout width, so without a reserved gutter the 10px lane only exists *while the table overflows* — a short table silently drops to a 6px right inset against a 16px left one, visibly off-centre. This is exactly the bug the operator reported on the POS cart table. The gutter makes the geometry identical in both states. `[scrollbar-gutter:stable]` was already an established idiom here (Settings/index.tsx, EditProduct/index.tsx, EditBundle/index.tsx, ReportPrintDialog.tsx) — not a new invention.

**Why two patterns existed:** on 2026-07-24 at 19:49 (`d1f9582`) the rule was written as wrapper-borders `border-l/r-[16px]` with the scrollbar 16px inset, and the doc claimed the operator "tried flush-right and rejected it". At **22:31 the same evening (`c8f6189`) the operator reversed it** — moved the border onto `<table>` with `border-r-[6px]`, scrollbar at the outer edge — but only applied it to POS + the `/theme` showcase. The other 23 files were left on the old shape for 2.5 weeks and had the mirrored defect (band 16px left / 26px right *while scrolling*). **The "tried and rejected flush-right" note is dead — ignore it if it resurfaces anywhere.**

**Lesson:** when `/theme` and `docs/claude/*.md` disagree, `git log -S '<the class>'` on both settles it by timestamp — the doc here was 3 hours older than the code decision it described. `/theme` is the SSOT ([[feedback-read-doc-before-ui-edit]]).

Related: [[table-card-bar-heights-locked]] (the `px-4` top bar aligns to this 16px left inset), [[feedback-scrollbar-thin]] (the 10px lane width this arithmetic depends on — if the scrollbar size ever changes, `border-r-[6px]` must change with it).
