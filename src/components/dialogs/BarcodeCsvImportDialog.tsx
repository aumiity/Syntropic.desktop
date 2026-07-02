import { useEffect, useRef, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/components/ui/toast'
import { FileUp, Upload, CheckCircle2, TriangleAlert } from 'lucide-react'
import type { TagCell } from '@/lib/tags/types'

// Header words to drop when they appear as a standalone token (a pasted Excel
// column or a CSV file often carries a header row). Compared case-insensitively.
const HEADER_TOKENS = new Set(['barcode', 'บาร์โค้ด', 'code', 'รหัส', 'sku'])

// Split pasted text / CSV content into barcode tokens. One barcode per line is
// the common case (an Excel column), but we also split on comma/tab/semicolon so
// a simple single-row CSV works too. Wrapping quotes are stripped; blanks and a
// leading header token are dropped.
function parseTokens(text: string): string[] {
  return text
    .split(/[\r\n,;\t]+/)
    .map((t) => t.trim().replace(/^["']+|["']+$/g, '').trim())
    .filter((t) => t.length > 0 && !HEADER_TOKENS.has(t.toLowerCase()))
}

interface ImportResult {
  added: number
  notFound: number
  overflow: number
}

/**
 * Bulk-import price-tag rows from a scanned barcode list. The operator scans
 * barcodes into an Excel column, pastes them here (or loads a .csv/.txt file),
 * and each barcode is resolved EXACTLY to its product+unit via
 * pos:resolveBarcodes. Matched rows are appended (duplicates kept → one tag per
 * pasted line, capped at `remaining`). Unmatched / over-capacity barcodes stay
 * in the box so the operator can review and retry.
 */
export function BarcodeCsvImportDialog({
  open,
  onClose,
  remaining,
  onImport,
}: {
  open: boolean
  onClose: () => void
  /** Free slots left on the sheet — matched rows beyond this are held back. */
  remaining: number
  onImport: (cells: TagCell[]) => void
}) {
  const { toast } = useToast()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) { setText(''); setBusy(false); setResult(null) }
  }, [open])

  const loadFile = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      const raw = String(reader.result ?? '')
      // Append to whatever is already there (so a file + a manual paste combine).
      setText((prev) => (prev.trim() ? `${prev.replace(/\s+$/, '')}\n${raw}` : raw))
      setResult(null)
    }
    reader.readAsText(file)
  }

  const handleImport = async () => {
    if (busy) return
    const tokens = parseTokens(text)
    if (tokens.length === 0) {
      toast('กรุณาวางหรือเลือกไฟล์บาร์โค้ดก่อน', 'error')
      return
    }
    if (remaining <= 0) {
      toast('รายการเต็มจำนวนสูงสุดต่อแผ่นแล้ว', 'error')
      return
    }
    setBusy(true)
    try {
      const resolved = await window.api.pos.resolveBarcodes(tokens)
      const map = new Map(resolved.map((r) => [r.barcode, r.cell]))
      const cells: TagCell[] = []
      const leftover: string[] = []
      let notFound = 0
      let overflow = 0
      for (const token of tokens) {
        const cell = map.get(token) ?? null
        if (!cell) { notFound++; leftover.push(token); continue }
        if (cells.length >= remaining) { overflow++; leftover.push(token); continue }
        // Copy per tag: duplicate barcodes share one resolved object, and the list
        // treats each row as independent (mirrors duplicatePrice's spread).
        cells.push({ ...cell })
      }
      if (cells.length > 0) onImport(cells)
      setResult({ added: cells.length, notFound, overflow })

      if (leftover.length === 0) {
        if (cells.length > 0) toast(`นำเข้าป้าย ${cells.length} รายการแล้ว`, 'success')
        onClose()
        return
      }
      // Keep the unresolved / held-back barcodes in the box for review.
      setText(leftover.join('\n'))
      if (cells.length > 0) toast(`นำเข้า ${cells.length} รายการ (เหลือ ${leftover.length} ที่ยังไม่สำเร็จ)`, 'info')
      else toast('ไม่พบบาร์โค้ดที่ตรงกับสินค้าในระบบ', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent size="xl" divided className="max-h-[85vh]" onClose={onClose}>
        <DialogHeader>
          <DialogTitle>นำเข้าบาร์โค้ดจาก Excel / CSV</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-3 overflow-y-auto">
          <div className="space-y-1 text-sm text-muted-foreground">
            <p className="text-foreground">
              ยิงบาร์โค้ดลงคอลัมน์ใน Excel แล้วคัดลอกมาวางในช่องด้านล่าง — หนึ่งบรรทัดต่อหนึ่งป้าย
              (สแกนซ้ำได้ = พิมพ์หลายป้าย) หรือกด "เลือกไฟล์" เพื่อโหลด .csv / .txt
            </p>
            <p className="text-xs">
              ระบบจะจับคู่บาร์โค้ดแบบตรงตัวกับสินค้า/หน่วยในระบบ บาร์โค้ดของหน่วย (เช่น กล่อง)
              จะได้ราคาของหน่วยนั้น ส่วนที่ไม่พบจะคงไว้ในช่องให้ตรวจสอบ
            </p>
          </div>

          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-foreground">รายการบาร์โค้ด</span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">เหลือพื้นที่ {remaining} ป้าย</span>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.txt,text/csv,text/plain"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) loadFile(f)
                  e.target.value = ''
                }}
              />
              <Button variant="elevated" size="lg" className="h-9" onClick={() => fileRef.current?.click()}>
                <FileUp className="size-4" /> เลือกไฟล์
              </Button>
            </div>
          </div>

          <Textarea
            value={text}
            onChange={(e) => { setText(e.target.value); setResult(null) }}
            placeholder={'8850001234567\n8850009876543\n...'}
            className="min-h-[14rem] font-mono text-sm"
            spellCheck={false}
          />

          {result && (
            <div className="space-y-1.5 rounded-lg border border-border bg-muted/40 p-3 text-sm">
              <div className="flex items-center gap-2 text-success">
                <CheckCircle2 className="size-4 shrink-0" />
                <span>เพิ่มป้ายสำเร็จ {result.added} รายการ</span>
              </div>
              {result.notFound > 0 && (
                <div className="flex items-center gap-2 text-warning">
                  <TriangleAlert className="size-4 shrink-0" />
                  <span>ไม่พบสินค้าที่ตรงกับบาร์โค้ด {result.notFound} รายการ</span>
                </div>
              )}
              {result.overflow > 0 && (
                <div className="flex items-center gap-2 text-warning">
                  <TriangleAlert className="size-4 shrink-0" />
                  <span>เกินจำนวนสูงสุดต่อแผ่น {result.overflow} รายการ (ไม่ได้เพิ่ม)</span>
                </div>
              )}
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="elevated" size="xl" onClick={onClose} disabled={busy}>ปิด</Button>
          <Button size="xl" onClick={handleImport} disabled={busy}>
            <Upload className="size-4" /> {busy ? 'กำลังนำเข้า...' : 'นำเข้า'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
