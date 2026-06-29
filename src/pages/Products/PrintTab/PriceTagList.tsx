import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/utils'
import { Copy, Trash2, TriangleAlert } from 'lucide-react'
import type { TagCell } from '@/lib/tags/types'

// Price-tag product list (50/sheet). A flat ordered list — one row = one printed
// tag (max `max`). No in-place replace: change an item by deleting + re-adding
// (the "เพิ่มสินค้า" button always appends). คัดลอก duplicates a row; ลบ removes it.
export function PriceTagList({
  items,
  max,
  onDuplicate,
  onRemove,
}: {
  items: TagCell[]
  max: number
  onDuplicate: (index: number) => void
  onRemove: (index: number) => void
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border-strong bg-card px-4 py-12 text-center text-sm text-muted-foreground">
        ยังไม่มีสินค้า — กด "เพิ่มสินค้า" เพื่อเริ่มต้น (สูงสุด {max} รายการต่อแผ่น)
      </div>
    )
  }
  return (
    // table-fixed = column widths are LOCKED (the name column won't grow with a long
    // name; it clips). The barcode column is gone — its no-barcode warning icon now
    // sits in front of the product name instead.
    <Table className="w-full table-fixed" containerClassName="rounded-lg border border-border max-h-[28rem] overflow-auto scrollbar-thin">
      <TableHeader>
        <TableRow className="[&>th]:h-9">
          <TableHead className="w-10 text-center">#</TableHead>
          <TableHead className="w-56">ชื่อสินค้า</TableHead>
          <TableHead className="w-14">หน่วย</TableHead>
          <TableHead className="w-14 text-right">ราคา</TableHead>
          <TableHead className="w-24 text-center">จัดการ</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((c, i) => (
          <TableRow key={i}>
            <TableCell className="text-center text-muted-foreground">{i + 1}</TableCell>
            <TableCell className="overflow-hidden font-medium text-foreground">
              <span className="flex items-center gap-1.5">
                {c.barcode_source !== 'own' && (
                  <span title="หน่วยนี้ไม่มีบาร์โค้ด — พิมพ์เฉพาะชื่อ/ราคา" className="text-warning shrink-0">
                    <TriangleAlert className="size-3.5" />
                  </span>
                )}
                <span className="min-w-0 overflow-x-clip overflow-y-visible whitespace-nowrap">{c.name}</span>
              </span>
            </TableCell>
            <TableCell className="text-muted-foreground overflow-hidden whitespace-nowrap">{c.unit_name || '-'}</TableCell>
            <TableCell className="text-right font-bold text-primary">{formatCurrency(c.price)}</TableCell>
            <TableCell>
              <div className="flex items-center justify-center gap-1.5">
                <Button variant="elevated" size="icon-lg" tooltip="คัดลอก" disabled={items.length >= max} onClick={() => onDuplicate(i)}>
                  <Copy />
                </Button>
                <Button variant="elevated-destructive-soft" size="icon-lg" tooltip="ลบ" onClick={() => onRemove(i)}>
                  <Trash2 />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
