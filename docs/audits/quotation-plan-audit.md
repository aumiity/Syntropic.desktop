# Audit: Quotation Plan

Date: 2026-05-31
Scope: Review of `docs/plans/quotation.md`

## Verdict

Needs revision before implementation. The plan covers the main feature shape, but it leaves a few high-risk gaps in numbering, document lifecycle, and required data ownership that will make the first implementation brittle.

## Findings

### High - Quote numbering reuses the same race-prone COUNT(*) pattern as POS

The plan says quotation numbers should be generated as `QT-YYYYMMDD-NNNN` using the same pattern as `saveBill` (`docs/plans/quotation.md:19`, `docs/plans/quotation.md:50`). The existing POS implementation already does this with `COUNT(*) + 1` inside a transaction (`electron/ipc/pos.ts:182-189`), and it is not concurrency-safe. Two saves at the same time can compute the same next number, then one insert will fail on the `UNIQUE` constraint or the numbering will skip unpredictably.

Required fix: define a real serial strategy before implementation. Use a dedicated sequence row, a retry loop on unique collision, or a locked counter table. Do not copy the current `COUNT(*)` pattern into a second document flow without a collision strategy.

### Medium - `issue_date` is required by the schema and print flow, but the plan never defines who owns it

The schema introduces `issue_date` (`docs/plans/quotation.md:35`), and the print layout needs a visible issue date (`docs/plans/quotation.md:58`). But the editor plan only mentions `valid_until` as a user-facing date field (`docs/plans/quotation.md:66`) and never states whether `issue_date` is set automatically on create, preserved on update, or editable.

That omission matters because the list, printout, and future conversion flow will all depend on the same field being stable and normalized. If this is left implicit, the implementation can easily end up with `NULL` issue dates or a mix of user-entered and system-entered timestamps.

Required fix: make `issue_date` explicit in the plan. The safest rule is `issue_date = save timestamp on create, immutable on update`, with the renderer treating it as read-only.

### Medium - The plan allows destructive edits across all statuses, which weakens the document trail

The list row actions include edit and delete for every quotation (`docs/plans/quotation.md:62`), and the save path says an update is handled by deleting and reinserting all items (`docs/plans/quotation.md:50`). That is fine for drafts, but the same plan also introduces `sent`, `accepted`, and `rejected` states (`docs/plans/quotation.md:36`, `docs/plans/quotation.md:53`).

Without a status gate, a quotation that has already been sent or accepted can still be rewritten in place, which makes the status history less meaningful and can desync printed copies from the stored record. Quotation documents are not just scratchpad data once they leave draft state.

Required fix: define allowed transitions and lock edit/delete to draft-only, or at least reject mutation for accepted/rejected/converted records. If the product really needs post-send edits, the plan should describe revision/version handling instead of silent overwrite.

### Low - The renderer type surface is underspecified

The plan says to update `electron/preload.ts` and add the `quotation` namespace (`docs/plans/quotation.md:48`, `docs/plans/quotation.md:81`), but the renderer in this repo types `window.api` from `@electron/preload` via `src/lib/utils.ts`, and the checked-in declaration file is `electron/preload.d.ts`. If that declaration is not updated alongside the runtime preload, the new IPC calls will be missing from type checking even if the app runs.

Required fix: include `electron/preload.d.ts` in the implementation checklist and verify the new `window.api.quotation.*` methods type-check in the renderer.

## Assumptions / Open Questions

1. I assumed quotation numbers must remain unique under concurrent saves, not just in single-user testing.
2. I assumed sent/accepted quotations are expected to be record-keeping artifacts, not fully editable working drafts.
3. I assumed the repository will continue to rely on the generated preload declaration for renderer typing.

## Summary

The plan is directionally correct, but it needs explicit decisions for numbering, `issue_date`, and lifecycle immutability before implementation starts. Those gaps are small on paper and expensive once the quotation flow ships.
