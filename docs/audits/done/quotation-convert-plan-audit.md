# Audit: Quotation Convert Plan

Date: 2026-05-31
Scope: Review of `docs/plans/quotation-convert.md`

## Verdict

Needs revision before implementation. The plan is structurally sound, but it leaves a few high-risk gaps in state ownership and failure handling that can produce duplicate sales or inconsistent quotation state.

## Findings

### High - Conversion is not reserved atomically, so the same accepted quote can be sold twice

The plan intentionally keeps conversion as "best-effort after successful sale" (`docs/plans/quotation-convert.md:55`) and only marks the quotation converted after `pos:saveBill` completes. That leaves a race window: two operators, or two app instances, can both load the same accepted quotation into POS and complete separate sales before either side writes `converted`.

This is not a theoretical edge case. The plan has no pre-conversion reservation, lock, or idempotency token, and the only backend guard is the post-sale `markConverted` call. By the time that runs, the second sale may already be committed.

Required fix: make conversion exclusive before the sale is created. The plan needs one of these:
1. a reservation state or conversion lock set before navigation to POS,
2. an atomic backend transition that claims the quotation before the cart is populated, or
3. an idempotent conversion token that `pos:saveBill` and `quotation:markConverted` both validate.

### Medium - The plan gives two paths to `converted`, but only one records `converted_invoice_no`

The backend section says `quotation:setStatus` should allow `accepted -> converted` (`docs/plans/quotation-convert.md:28`) and also introduces `quotation:markConverted(id, invoice_no)` to set `status='converted'` plus `converted_invoice_no` (`docs/plans/quotation-convert.md:29`). That is two different ways to reach the terminal state, but only one of them captures the linked sale number.

If a later UI path, maintenance script, or manual call uses the generic status setter, the quotation becomes `converted` with no invoice link. That breaks the traceability the plan says it wants on the list and detail screens.

Required fix: collapse conversion to a single backend path. Either remove `converted` from the generic status setter, or make the generic setter require and persist `converted_invoice_no` when entering the terminal state.

### Medium - Missing product lines are only toasted, but the plan does not say whether conversion should stop

`buildCartItemsFromQuote()` is defined to skip rows with no `product_id` or missing/disabled products and return a `skipped` list (`docs/plans/quotation-convert.md:37-43`). The conversion handler then only shows a toast warning and continues (`docs/plans/quotation-convert.md:46-51`).

That is risky for an accepted quote. Continuing with a partial cart can silently underbill the customer or create a sale that no longer matches the document the customer approved. A toast is not enough to protect the operator from missing a line item in the middle of a handoff.

Required fix: define the failure policy explicitly. For accepted quotations, the safer default is to block conversion when any line cannot be rebuilt, unless the operator confirms a deliberate partial conversion and the resulting sale is explicitly annotated.

## Assumptions / Open Questions

1. I assumed the same quote can be opened from multiple clients or terminals at once.
2. I assumed `converted` is intended to be a terminal, auditable state, not just a UI label.
3. I assumed an accepted quotation should not silently turn into a smaller sale without a deliberate confirmation step.

## Summary

The plan gets the user flow right, but it needs a stronger backend contract before it is safe to implement. The main thing to fix is exclusivity: reserve the quotation before the sale starts, and make `converted` writable through one path only.
