import { SelectItem, SelectSeparator } from '@/components/ui/select'
import { PRINT_TO_PDF_VALUE, PRINT_TO_PDF_LABEL, type PrinterOption } from '@/lib/print/pdfPrinter'

// Shared body for the printer dropdown in all three Settings printer tabs
// (เอกสาร A4 / ฉลากยา / ใบเสร็จ): the system-default + physical printers first,
// then a divider, then the virtual "Print to PDF" choice grouped at the bottom
// so it reads as a separate kind of target (export, not a device).
//
// `options` = buildPrinterOptions(printers) — default + physical devices, no PDF.
export function PrinterSelectItems({ options }: { options: PrinterOption[] }) {
  return (
    <>
      {options.map(p => (
        <SelectItem key={p.name || '__default__'} value={p.name || '__default__'}>
          {p.displayName}{p.isDefault ? ' (default)' : ''}
        </SelectItem>
      ))}
      <SelectSeparator />
      <SelectItem value={PRINT_TO_PDF_VALUE}>{PRINT_TO_PDF_LABEL}</SelectItem>
    </>
  )
}
