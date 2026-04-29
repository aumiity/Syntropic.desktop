Prompt 1 — Replace modals

Refactor src/pages/POS/index.tsx. Replace the local InlineModal component and the raw-div product search overlay with the project's existing Dialog components from src/components/ui/dialog, which exports: Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter.

Modals to convert (all currently use InlineModal):

Customer Search, Customer Info, Quick Add Customer, Unit, Price, Qty, Discount modals
The product search overlay (currently a raw div at z-50 with fixed 1000×800px size) should also become a Dialog. Keep the 1000×800 size via inline style. Keep the internal layout unchanged: search input row, column header row, flex-1 overflow-y-auto result list, footer status bar.

Do not change: any business logic, state, event handlers, Thai text, Tailwind classes on unchanged elements, or the focus management system (mainInputRef, modalInputRef, anyModalOpenRef, searchOpenRef, the mousedown/focusout listeners — these are critical).

Output the full updated file.

Prompt 2 — Replace buttons

Refactor src/pages/POS/index.tsx. Replace all raw <button> elements with Button from src/components/ui/button. Use the variant and size props as listed below. Keep all existing className color overrides, onClick handlers, disabled props, and inner content unchanged.

Replacements:

Sale type toggle (ปลีก/ส่ง): active → variant="default", inactive → variant="outline". Keep the grouping wrapper div.
Customer selector: variant="outline", keep inner two-line layout + chevron
Clear customer X: variant="ghost" size="icon"
Info button: variant="ghost" size="icon", keep disabled prop
Add customer UserPlus: variant="ghost" size="icon"
Unit / Qty / Price / Discount cell buttons in cart rows: variant="outline" size="sm"
Remove item Trash2: variant="ghost" size="icon"
Esc and clear-query in search modal: variant="ghost" size="sm" / size="icon"
"ลูกค้าทั่วไป" and customer result rows: variant="ghost" with className="w-full justify-start"
Unit option and price option buttons in modals: variant="outline" full-width, keep active-state className
Minus / Plus in qty modal: variant="outline" size="icon"
Qty presets (1, 5, 10, 20, 50): variant="outline" size="sm"
Discount % presets (3–20%): variant="outline" size="sm", keep per-preset color className
Do not change: any business logic, state, event handlers, Thai text, or the focus management system.

Output the full updated file.

Prompt 3 — Replace remaining primitives

Refactor src/pages/POS/index.tsx. Three small replacements using components from src/components/ui/:

Tabs — Replace the cart slot tab strip (the 3 "รายการขาย" <button> elements inside the flex items-end border-b div) with Tabs, TabsList, TabsTrigger from ui/tabs. Keep the dot indicator (w-1.5 h-1.5 rounded-full bg-emerald-500) for slots that have items. Keep onClick={() => { cart.setActiveSlot(i); refocusSearch() }} on each trigger.

Label — Replace the raw <label> wrapping "รับเงินมา" (inside the payment modal cash input section) with Label from ui/label.

Badge — Replace the three health coverage <span> tags (บัตรทอง, ข้าราชการ, ประกันสังคม) inside the customer info modal with Badge from ui/badge using variant="outline". Keep the existing color className on each.

Do not change: any business logic, state, event handlers, Thai text, or the focus management system.

Output the full updated file.