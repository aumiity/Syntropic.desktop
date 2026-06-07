---
name: project_printer_settings
description: Printer-settings hub — unified เครื่องพิมพ์ tab, A4 docs share one printer via document_settings
metadata:
  type: project
---

**DONE 2026-06-02** — Printer settings consolidated into one Settings tab "เครื่องพิมพ์" (`PrintersTab.tsx`) with three inner segmented sub-sections: **เอกสาร A4** (`DocumentSettingsTab.tsx`, new) / **ฉลากยา** (`LabelSettingsTab`) / **ใบเสร็จ** (`ReceiptSettingsTab`). The old top-level `labels`/`receipts` tabs were collapsed into it.

The gap this closed: A4 documents (ใบกำกับภาษีเต็มรูป, ใบรับสินค้า, ใบเสนอราคา) previously always printed to the OS default printer — every A4 caller passed `printerName = ''` and nothing was configurable.

Design decisions (operator-confirmed, could be revisited):
- **One A4 printer for ALL A4 docs**, NOT per-document. Stored in singleton table `document_settings` (`printer_name`, `copies`, `paper_size`). If a future need arises to split tax-invoice vs goods-receipt vs quotation onto different printers, this is where it'd grow.
- **Page size is selectable A4/A5 as of 2026-06-08** (was fixed A4). Stored in `document_settings.paper_size` ('A4'|'A5'). `docConfig()` reads it and returns `{paperSize, widthMm, heightMm}`; all three builders (`buildTaxInvoiceHtml`/`buildGoodsReceiptHtml`/`buildQuotationHtml`) take an `opts.paperSize` and emit `@page { size: <A4|A5> }`; print/preview pass the matching dims/pageFormat. DocumentSettingsTab preview renders true-size then `transform: scale()` to fit column width (full page width visible, scroll page for length). A5 = 148×210mm; layout reflows (12mm body padding, 11pt font kept — fine for A5).

Wiring: `printTaxInvoice` / `printQuotation` / `printGoodsReceipt` in `src/lib/receipt/print.ts` now call `docConfig(printerName?)` which reads `document_settings` and falls back to it when no explicit printerName is passed (explicit non-empty arg still wins). Receipt + label printers were already configurable in their own tables — only A4 was missing.

**Layout (2026-06-08):** all three sub-tabs are page-scroll (natural height, ride the Settings page outer scroll — no per-tab `h-full`/internal scroll), so every tab shares the same page bottom margin. Each sub-tab has NO titled action bar; it registers its action controls (ดูตัวอย่าง PDF / ทดสอบพิมพ์ / บันทึก) up to `PrintersTab` via an `onActions(node)` prop, rendered on the SAME row as the sub-tab strip (handlers read through a `useRef` so the registered node never goes stale without re-registering every render → no loop; `setActions` is stable). Per-tab printer picker: A4 uses the shared `document_settings.printer_name` (in its settings card); ฉลากยา's printer picker lives INSIDE its "ขนาดกระดาษ" card (not the action row); ใบเสร็จ's is in its "เครื่องพิมพ์ & กระดาษ" card.

Relates to [[project_next_systems_backlog]] (receipt/tax-invoice printing line).
