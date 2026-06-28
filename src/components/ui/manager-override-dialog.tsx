import { useState, useEffect, useRef } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FormField } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/select'
import { Eye, EyeOff, ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/utils'

export type ManagerOverride = { userId: number; password: string }

type AdminUser = { id: number; name: string; role: string }

// Reusable manager-override prompt. A staff member triggering an admin-only
// action (void / price / stock-lot / GR-cancel) supplies an admin's credential
// inline; the credential is passed to the action's IPC call and verified
// SERVER-SIDE (requireAdmin). The password/hash never round-trips on its own —
// no token to leak. `onSubmit` performs the gated action and THROWS on failure
// (e.g. wrong password); the dialog stays open and surfaces the error so the
// user can retry. It closes only on success. See User_Login_System.md §4.3.
export function ManagerOverrideDialog({
  open,
  onOpenChange,
  title = 'ต้องการสิทธิ์ผู้ดูแล',
  description = 'การทำรายการนี้ต้องได้รับอนุญาตจากผู้ดูแล กรุณาเลือกผู้ดูแลและกรอกรหัสผ่าน',
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title?: string
  description?: string
  onSubmit: (cred: ManagerOverride) => Promise<void>
}) {
  const [admins, setAdmins] = useState<AdminUser[]>([])
  const [userId, setUserId] = useState<number | null>(null)
  const [pw, setPw] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pwRef = useRef<HTMLInputElement>(null)

  // Load the admin shortlist each time the dialog opens; reset transient state.
  useEffect(() => {
    if (!open) return
    setPw(''); setShowPw(false); setBusy(false); setError(null)
    let alive = true
    window.api.auth.listLoginUsers()
      .then((list: AdminUser[]) => {
        if (!alive) return
        const onlyAdmins = (list ?? []).filter(u => u.role === 'owner')
        setAdmins(onlyAdmins)
        setUserId(onlyAdmins[0]?.id ?? null)
      })
      .catch(() => { if (alive) { setAdmins([]); setUserId(null) } })
    return () => { alive = false }
  }, [open])

  useEffect(() => {
    if (open) setTimeout(() => pwRef.current?.focus(), 0)
  }, [open, admins.length])

  const submit = () => {
    if (busy || !userId || !pw) { if (!pw) setError('กรุณากรอกรหัสผ่าน'); return }
    setBusy(true)
    setError(null)
    onSubmit({ userId, password: pw })
      .then(() => { onOpenChange(false) })
      .catch((e: any) => {
        const raw = String(e?.message ?? '')
        // Electron ห่อ error จาก main เป็น "Error invoking remote method 'X': Error: <ของจริง>"
        // ตัด prefix ทั้งสองชั้นออกให้เหลือแค่ข้อความที่ผู้ใช้อ่านรู้เรื่อง
        const msg = raw
          .replace(/^Error invoking remote method '[^']*':\s*/, '')
          .replace(/^Error:\s*/, '')
        setBusy(false)
        setPw('')
        setError(raw.includes('LOCKED') ? 'พยายามหลายครั้งเกินไป กรุณารอสักครู่' : (msg || 'รหัสผ่านไม่ถูกต้อง'))
        setTimeout(() => pwRef.current?.focus(), 0)
      })
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) onOpenChange(o) }}>
      <DialogContent size="sm" divided onClose={() => !busy && onOpenChange(false)}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-primary" />
            {title}
          </DialogTitle>
        </DialogHeader>

        <DialogBody className="space-y-4">
          <div className="text-sm text-muted-foreground">{description}</div>

          {admins.length === 0 ? (
            <div className="text-sm text-destructive">ไม่พบบัญชีผู้ดูแลที่เปิดใช้งาน</div>
          ) : (
            <>
              <FormField label="ผู้ดูแล">
                <NativeSelect
                  value={userId ?? ''}
                  onChange={v => setUserId(Number(v))}
                >
                  {admins.map(a => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </NativeSelect>
              </FormField>

              <FormField label="รหัสผ่าน">
                <div className="relative">
                  <Input
                    ref={pwRef}
                    type={showPw ? 'text' : 'password'}
                    value={pw}
                    onChange={e => { setPw(e.target.value); if (error) setError(null) }}
                    onKeyDown={e => { if (e.key === 'Enter') submit() }}
                    disabled={busy}
                    className={cn('pr-10', error && 'border-destructive focus-visible:ring-destructive/30')}
                    placeholder="••••••••"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowPw(v => !v)}
                    className="absolute right-1 top-1/2 -translate-y-1/2"
                    tabIndex={-1}
                  >
                    {showPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </Button>
                </div>
                {error && <div className="text-xs text-destructive">{error}</div>}
              </FormField>
            </>
          )}
        </DialogBody>

        <DialogFooter>
          <Button variant="elevated" onClick={() => onOpenChange(false)} disabled={busy}>
            ยกเลิก
          </Button>
          <Button onClick={submit} disabled={busy || admins.length === 0}>
            {busy ? 'กำลังตรวจสอบ...' : 'ยืนยัน'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
