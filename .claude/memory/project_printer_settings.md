---
name: project_printer_settings
description: Printer-settings hub — unified เครื่องพิมพ์ tab, A4 docs share one printer via document_settings
metadata:
  type: project
---

**DONE 2026-06-02** — Printer settings consolidated into one Settings tab "เครื่องพิมพ์" (`PrintersTab.tsx`) with three inner segmented sub-sections: **เอกสาร A4** (`DocumentSettingsTab.tsx`, new) / **ฉลากยา** (`LabelSettingsTab`) / **ใบเสร็จ** (`ReceiptSettingsTab`). The old top-level `labels`/`receipts` tabs were collapsed into it.

The gap this closed: A4 documents (ใบกำกับภาษีเต็มรูป, ใบรับสินค้า, ใบเสนอราคา) previously always printed to the OS default printer — every A4 caller passed `printerName = ''` and nothing was configurable.

Design decisions (operator-confirmed, could be revisited):
- **One A4 printer for ALL A4 docs**, NOT per-document. Stored in singleton table `document_settings` (`printer_name`, `copies`). If a future need arises to split tax-invoice vs goods-receipt vs quotation onto different printers, this is where it'd grow.
- Page size is fixed A4 (210×297 mm) in the print helpers — not configurable.

Wiring: `printTaxInvoice` / `printQuotation` / `printGoodsReceipt` in `src/lib/receipt/print.ts` now call `docConfig(printerName?)` which reads `document_settings` and falls back to it when no explicit printerName is passed (explicit non-empty arg still wins). Receipt + label printers were already configurable in their own tables — only A4 was missing.

Relates to [[project_next_systems_backlog]] (receipt/tax-invoice printing line).
