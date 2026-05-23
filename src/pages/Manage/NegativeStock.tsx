import { useEffect, useState, useCallback } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter,
} from '@/components/ui/dialog'
import { useToast } from '@/components/ui/toast'
import { formatDateTime } from '@/lib/utils'
import { useUserStore } from '@/stores/userStore'
import { useNegativeStockBadge } from '@/stores/negativeStockBadge'
import type { ManageOutletContext } from './index'
import type { NegativeStockRow } from '@/types'
import { PackageCheck, Trash2 } from 'lucide-react'

type Confirming =
  | { kind: 'reconcile'; row: NegativeStockRow }
  | { kind: 'dismiss';   row: NegativeStockRow }
  | null

export default function NegativeStockPage() {
  const { toast } = useToast()
  const { setSummary } = useOutletContext<ManageOutletContext>()
  const user = useUserStore(s => s.current)
  const refreshBadge = useNegativeStockBadge(s => s.refresh)

  const [rows, setRows] = useState<NegativeStockRow[]>([])
  const [loading, setLoading] = useState(false)
  const [confirming, setConfirming] = useState<Confirming>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const list = await (window as any).api.negativeStock.list() as NegativeStockRow[]
      setRows(list ?? [])
    } catch (e: any) {
      toast(e?.message ?? 'โหลดข้อมูลไม่สำเร็จ', 'error')
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => { load() }, [load])

  // NegativeStock has no summary cards. ManageLayout clears summary on tab
  // change, so no clear-on-mount needed here.
  useEffect(() => {
    setSummary(null)
  }, [setSummary])

  const handleReconcile = async (row: NegativeStockRow) => {
    if (!user) { toast('ยังไม่ได้โหลดข้อมูลผู้ใช้งาน', 'error'); return }
    setBusy(true)
    try {
      const res = await (window as any).api.negativeStock.reconcile({ id: row.id, userId: user.id }) as {
        success: boolean; deducted_qty: number; remaining_qty: number
      }
      const tail = res.remaining_qty > 0
        ? `ตัดได้ ${res.deducted_qty} (เหลือค้าง ${res.remaining_qty})`
        : `ตัดครบ ${res.deducted_qty} ${row.unit_name ?? ''}`.trim()
      toast(`${row.trade_name} — ${tail}`, 'success')
      setConfirming(null)
      await Promise.all([load(), refreshBadge()])
    } catch (e: any) {
      toast(e?.message ?? 'ตัดสต๊อกไม่สำเร็จ', 'error')
    } finally {
      setBusy(false)
    }
  }

  const handleDismiss = async (row: NegativeStockRow) => {
    if (!user) { toast('ยังไม่ได้โหลดข้อมูลผู้ใช้งาน', 'error'); return }
    setBusy(true)
    try {
      await (window as any).api.negativeStock.dismiss({ id: row.id, userId: user.id })
      toast(`ลบรายการ ${row.trade_name} แล้ว (ไม่ตัดสต๊อก)`, 'success')
      setConfirming(null)
      await Promise.all([load(), refreshBadge()])
    } catch (e: any) {
      toast(e?.message ?? 'ลบรายการไม่สำเร็จ', 'error')
    } finally {
      setBusy(false)
    }
  }

  const handleConfirm = () => {
    // Guard against Enter-key double-submission: the OK button is `disabled`
    // while busy, but the dialog body's onKeyDown still fires and would
    // otherwise re-trigger the IPC mid-flight.
    if (!confirming || busy) return
    if (confirming.kind === 'reconcile') handleReconcile(confirming.row)
    else handleDismiss(confirming.row)
  }

  return (
    <>
      <div className="flex flex-1 flex-col min-h-0 bg-card rounded-card shadow-card overflow-hidden">
        <div className="h-12 px-5 flex items-center justify-between shrink-0">
          <span className="text-sm font-semibold text-muted-foreground">
            รายการขายที่สต๊อกติดลบ — ตัดสต๊อกย้อนหลังเมื่อรับสินค้าเข้าระบบแล้ว
          </span>
        </div>

        <div className="flex-1 min-h-0 [&>[data-slot=table-container]]:h-full [&>[data-slot=table-container]]:overflow-auto [&>[data-slot=table-container]]:scrollbar-thin border-l-8 border-r-8 border-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-28">เลขที่บิล</TableHead>
                <TableHead className="min-w-32">วันที่ขาย</TableHead>
                <TableHead className="min-w-40">ชื่อสินค้า</TableHead>
                <TableHead className="min-w-24 text-center">จำนวนค้าง</TableHead>
                <TableHead className="min-w-24 text-right">สต๊อกปัจจุบัน</TableHead>
                <TableHead className="min-w-24 text-center">การจัดการ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-16">กำลังโหลด...</TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-16">
                    <PackageCheck className="size-10 mx-auto mb-2 opacity-30" />
                    ไม่มีรายการสต๊อคติดลบค้างอยู่
                  </TableCell>
                </TableRow>
              ) : rows.map(r => {
                const canReconcile = r.available_stock > 0
                return (
                  <TableRow key={r.id}>
                    <TableCell className="text-sm font-medium whitespace-nowrap">{r.invoice_no}</TableCell>
                    <TableCell className="text-sm whitespace-nowrap">{formatDateTime(r.sold_at)}</TableCell>
                    <TableCell className="min-w-56 text-sm font-medium truncate" title={r.trade_name}>{r.trade_name}</TableCell>
                    <TableCell className="text-center text-sm font-bold tabular-nums text-destructive whitespace-nowrap">
                      {r.qty.toLocaleString()} {r.unit_name && <span className="text-xs text-foreground-subtle ml-0.5">{r.unit_name}</span>}
                    </TableCell>
                    <TableCell className={`text-right text-sm tabular-nums whitespace-nowrap ${canReconcile ? 'text-success font-semibold' : 'text-foreground-subtle'}`}>
                      {r.available_stock.toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1.5 justify-center">
                        <Button
                          size="icon-lg"
                          variant="success"
                          title={canReconcile ? 'ตัดสต๊อคย้อนหลัง' : 'ไม่มีสต๊อกพร้อมตัด — ต้องรับสินค้าก่อน'}
                          disabled={!canReconcile}
                          onClick={() => setConfirming({ kind: 'reconcile', row: r })}
                        >
                          <PackageCheck className="size-4" />
                        </Button>
                        <Button
                          size="icon-lg"
                          variant="destructive2"
                          title="ลบรายการโดยไม่ตัดสต๊อค"
                          onClick={() => setConfirming({ kind: 'dismiss', row: r })}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>

        <div className="h-12 px-5 bg-card border-t border-border flex items-center justify-between text-sm shrink-0">
          <span className="text-muted-foreground">
            {loading ? 'กำลังโหลด...' : <>แสดง <span className="font-semibold text-foreground tabular-nums">{rows.length.toLocaleString()}</span> รายการ</>}
          </span>
        </div>
      </div>

      <Dialog
        open={!!confirming}
        onOpenChange={(o) => { if (!o && !busy) setConfirming(null) }}
      >
        <DialogContent size="sm" onClose={() => !busy && setConfirming(null)}>
          {confirming && (
            <div onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleConfirm() } }}>
              <DialogHeader>
                <DialogTitle>
                  {confirming.kind === 'reconcile' ? 'ยืนยันตัดสต๊อคย้อนหลัง' : 'ยืนยันลบรายการ'}
                </DialogTitle>
              </DialogHeader>
              <DialogBody className="space-y-3 pt-3">
                <div className="rounded-xl bg-muted/50 p-3 space-y-2 text-sm">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-muted-foreground shrink-0">เลขที่บิล</span>
                    <span className="font-mono font-semibold">{confirming.row.invoice_no}</span>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-muted-foreground shrink-0">สินค้า</span>
                    <span className="font-medium text-right">{confirming.row.trade_name}</span>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-muted-foreground shrink-0">จำนวนค้าง</span>
                    <span className="font-semibold text-destructive tabular-nums">
                      {confirming.row.qty.toLocaleString()} {confirming.row.unit_name}
                    </span>
                  </div>
                </div>

                {confirming.kind === 'reconcile' ? (
                  <>
                    <div className="rounded-xl bg-success-soft p-3 text-sm text-success leading-relaxed">
                      จะตัดสต๊อก <span className="font-bold tabular-nums">
                        {Math.min(confirming.row.qty, confirming.row.available_stock).toLocaleString()}
                      </span> {confirming.row.unit_name} จากล็อตปัจจุบัน (FEFO)
                    </div>
                    {confirming.row.available_stock < confirming.row.qty && (
                      <div className="rounded-xl bg-warning-soft p-3 text-sm text-warning-strong leading-relaxed">
                        สต๊อกปัจจุบันไม่พอตัดครบ — เหลือค้าง <span className="font-bold tabular-nums">
                          {(confirming.row.qty - confirming.row.available_stock).toLocaleString()}
                        </span> {confirming.row.unit_name}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="rounded-xl bg-destructive-soft p-3 text-sm text-destructive leading-relaxed">
                    จะลบรายการนี้โดยไม่ตัดสต๊อก — สต๊อกในระบบคงอยู่ตามเดิม การกระทำนี้บันทึกในประวัติเพื่อ audit
                  </div>
                )}
              </DialogBody>
              <DialogFooter className="pt-4">
                <Button variant="destructive2" size="xl" className="flex-1" disabled={busy} onClick={() => setConfirming(null)}>
                  ยกเลิก
                </Button>
                <Button
                  size="xl"
                  className="flex-1"
                  variant={confirming.kind === 'reconcile' ? 'success' : 'destructive'}
                  disabled={busy}
                  onClick={handleConfirm}
                >
                  {confirming.kind === 'reconcile' ? 'ตัดสต๊อค' : 'ลบรายการ'}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
