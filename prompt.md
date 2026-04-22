You are updating the POS screen in Syntropic Desktop (Electron + React + shadcn/ui).
Apply ALL of the following changes:

---

1. SEARCH BOX ALWAYS FOCUSED
- The search input must always hold keyboard focus on the POS screen
- After ANY action completes (add item to cart, select unit, select price, close modal,
  change quantity, click anywhere on screen), immediately return focus to the search input
- Use a global click listener on the POS page: any click that does not target an interactive
  element (input, button, select) should refocus the search input
- The blinking cursor must always be visible in the search box

---

2. SEARCH MODAL — FIXED SIZE
- The search modal must have a fixed height and width regardless of result count
- Recommended size: width 600px, height 480px (adjust to fit design)
- If results are fewer than the visible rows, remaining space stays empty
- If results exceed visible rows, the list scrolls inside the modal
- The modal must never resize or reflow based on content

---

3. SEARCH RESULT ROW — FULL ROW HIGHLIGHT + MORE COLUMNS
- Each result row must highlight the entire row on hover and keyboard navigation (not just text)
- Each row must display these columns:
  · Product name (ชื่อสินค้า)
  · Unit (หน่วย)
  · Selling price (ราคาขาย)
  · Remaining stock (จำนวนคงเหลือ)
- Use a clear highlighted background (e.g. primary color or blue-100) for the active row
- Selected row via Enter adds the item to cart and returns focus to search input

---

4. REFERENCE PHP VERSION — DEEP ANALYSIS REQUIRED
Before implementing items #2 and #3 above, you MUST first:

1. Open and read the PHP version source files located at [path/to/php/version]
2. Identify exactly how the search modal, unit selector, and price selector
   are implemented in the PHP version
3. List what you found (component structure, behavior, edge cases)
4. Implement the Electron/React version to match that behavior as closely as possible

Do not assume — read the actual PHP source first.