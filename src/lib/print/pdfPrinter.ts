// Virtual "Print to PDF" printer — selectable in every Settings > เครื่องพิมพ์ tab
// (เอกสาร A4 / ฉลากยา / ใบเสร็จ). When the saved printer_name equals
// PRINT_TO_PDF_VALUE, the real print IPC handlers (printer:printHtml /
// printer:printLabel) detect the sentinel and export the HTML to a true
// paper-size PDF + open it in the OS viewer instead of spooling to a physical
// device — so every print path (POS auto-print, label print, A4 docs, test
// print) routes to PDF for free, no caller changes.
//
// The same literal lives in electron/ipc/printer.ts (PRINT_TO_PDF) — renderer
// and main are built separately, so the two must be kept in sync by hand.
export const PRINT_TO_PDF_VALUE = '__print_to_pdf__'
export const PRINT_TO_PDF_LABEL = 'บันทึกเป็น PDF (Print to PDF)'

export interface PrinterOption { name: string; displayName: string; isDefault: boolean }

// Prepend the system-default entry to the physical printer list. Shared by all
// three Settings printer tabs so the top of the dropdown is identical. The
// virtual "Print to PDF" choice is NOT in this list — it's rendered as a
// separate group at the BOTTOM of the dropdown (divider + own item) by
// <PrinterSelectItems>.
export function buildPrinterOptions(printers: PrinterOption[]): PrinterOption[] {
  return [
    { name: '', displayName: 'เครื่องพิมพ์ระบบ (ค่าเริ่มต้น)', isDefault: false },
    ...printers,
  ]
}