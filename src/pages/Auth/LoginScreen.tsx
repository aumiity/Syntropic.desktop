import { useState, useEffect, useRef } from 'react'
import { TitleBar } from '@/components/layout/TitleBar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FormField } from '@/components/ui/label'
import { InitialAvatar } from '@/components/ui/avatar'
import { useToast } from '@/components/ui/toast'
import { useThemeStore } from '@/stores/themeStore'
import { useUserStore, type CurrentUser } from '@/stores/userStore'
import { BrandPanel, BrandLogo } from '@/components/ui/brand'
import { cn } from '@/lib/utils'
import { Eye, EyeOff, LogIn, ArrowLeft, ChevronRight, ShieldCheck, Check, Sun, Moon, KeyRound, Copy } from 'lucide-react'

// Login screen (ชั้น C) — เลือกผู้ใช้ + ใส่ password. ดู design brief:
// docs/plans/Login_UI_Design.md และ logic: docs/plans/User_Login_System.md
//
// preview: โหมด mockup สำหรับปุ่ม DEV ในหน้า Settings — ใช้ผู้ใช้ตัวอย่าง,
// ไม่เรียก auth IPC จริง, ไม่แตะข้อมูล. รหัสตัวอย่างคือ "1234".
// preview=false (โหมดจริง): โหลดรายชื่อจาก window.api.auth.listLoginUsers และ
// ยืนยันด้วย window.api.auth.login — lockout จริงนับฝั่ง main; ตัวนับ/นาฬิกาใน UI
// เป็นแค่ feedback ระหว่างรอ. (Phase 2.5 จะเพิ่ม flow กู้รหัสจริง)

type LoginUser = { id: number; name: string; username: string; email: string; role: 'owner' | 'pharmacist' | 'staff' }

const PREVIEW_USERS: LoginUser[] = [
  { id: 1, name: 'อุ้ม', username: 'aum', email: 'aum@syntropic.local', role: 'owner' },
  { id: 2, name: 'บี', username: 'bee', email: 'bee@syntropic.local', role: 'staff' },
  { id: 3, name: 'มินต์', username: 'mint', email: 'mint@syntropic.local', role: 'staff' },
]
const PREVIEW_PASSWORD = '1234'
const LOCK_THRESHOLD = 5
const LOCK_SECONDS = 30

// The owner account always sorts to the top of the picker; same-role order is
// preserved (Array.prototype.sort is stable).
const adminFirst = (list: LoginUser[]) =>
  [...list].sort((a, b) => (a.role === b.role ? 0 : a.role === 'owner' ? -1 : 1))

export function LoginScreen({ onComplete, preview = false }: { onComplete?: () => void; preview?: boolean }) {
  const { toast } = useToast()
  const toggleTheme = useThemeStore(s => s.toggleTheme)
  const theme = useThemeStore(s => s.theme)

  const [users, setUsers] = useState<LoginUser[]>(preview ? adminFirst(PREVIEW_USERS) : [])
  const [loadingUsers, setLoadingUsers] = useState(!preview)
  const single = users.length === 1

  // Shop name shown above the login card — pulled from settings in both real and
  // preview mode (a read-only fetch, so the DEV preview looks like the real thing).
  const [shopName, setShopName] = useState('')

  const [selected, setSelected] = useState<LoginUser | null>(null)
  const [pw, setPw] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState(false)
  const [shaking, setShaking] = useState(false)
  const [checking, setChecking] = useState(false)
  const [success, setSuccess] = useState(false)
  const [fails, setFails] = useState(0)
  const [lockUntil, setLockUntil] = useState<number | null>(null)
  const [now, setNow] = useState(Date.now())
  const pwRef = useRef<HTMLInputElement>(null)

  // Recovery (ลืมรหัสผ่าน) — self-service admin password reset via recovery code.
  // 'form' = enter code + new password; 'done' = show the freshly regenerated
  // recovery code once. Not available in preview (no IPC).
  const [recoverView, setRecoverView] = useState<null | 'form' | 'done'>(null)
  const [recoverCode, setRecoverCode] = useState('')
  const [recoverNewPw, setRecoverNewPw] = useState('')
  const [recoverBusy, setRecoverBusy] = useState(false)
  const [recoverError, setRecoverError] = useState<string | null>(null)
  const [newRecoveryCode, setNewRecoveryCode] = useState('')
  const [copied, setCopied] = useState(false)

  const stage = selected ? 'password' : 'select'
  const lockRemaining = lockUntil ? Math.max(0, Math.ceil((lockUntil - now) / 1000)) : 0
  const locked = lockRemaining > 0

  // Real mode: load the login user list from main. Preview seeds PREVIEW_USERS.
  useEffect(() => {
    if (preview) return
    let alive = true
    window.api.auth.listLoginUsers()
      .then((list: LoginUser[]) => { if (alive) setUsers(adminFirst(list ?? [])) })
      .catch(() => { if (alive) setUsers([]) })
      .finally(() => { if (alive) setLoadingUsers(false) })
    return () => { alive = false }
  }, [preview])

  // Load the shop name for the heading (read-only — runs in preview too).
  useEffect(() => {
    window.api.settings.getShop().then((d: any) => setShopName(d?.shop_name || '')).catch(() => {})
  }, [])

  // A single user skips the picker — jump straight to the password stage.
  // Guarded by `!selected` so re-running on `selected` change can't re-select.
  useEffect(() => {
    if (users.length === 1 && !selected) setSelected(users[0])
  }, [users, selected])

  // Tick once a second only while a lockout is counting down.
  useEffect(() => {
    if (!lockUntil) return
    const t = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(t)
  }, [lockUntil])

  // Lockout expired → clear the counter + stale error so the user starts fresh.
  useEffect(() => {
    if (lockUntil && lockRemaining === 0) { setLockUntil(null); setFails(0); setError(false) }
  }, [lockUntil, lockRemaining])

  // Reset the shake flag on a timer (not onAnimationEnd) — under
  // prefers-reduced-motion the animation is suppressed so `animationend` never
  // fires; a timer guarantees the flag clears so the next wrong attempt retriggers.
  useEffect(() => {
    if (!shaking) return
    const t = setTimeout(() => setShaking(false), 450)
    return () => clearTimeout(t)
  }, [shaking])

  // Fade the success state briefly, then hand off — cleaned up on unmount so a
  // pending hand-off never fires on a torn-down component.
  useEffect(() => {
    if (!success) return
    const t = setTimeout(() => onComplete?.(), 650)
    return () => clearTimeout(t)
  }, [success])

  // Auto-focus the password field when entering the password stage.
  useEffect(() => {
    if (stage === 'password') setTimeout(() => pwRef.current?.focus(), 0)
  }, [stage, selected])

  const pickUser = (u: LoginUser) => {
    setSelected(u)
    setPw(''); setError(false); setShowPw(false)
  }

  const backToSelect = () => {
    if (single) return
    setSelected(null)
    setPw(''); setError(false); setShowPw(false)
  }

  const onFail = (lockMs?: number) => {
    const n = fails + 1
    setFails(n)
    setError(true)
    setShaking(true)
    setPw('')
    if (lockMs && lockMs > 0) setLockUntil(Date.now() + lockMs)
    else if (n >= LOCK_THRESHOLD) setLockUntil(Date.now() + LOCK_SECONDS * 1000)
    setTimeout(() => pwRef.current?.focus(), 0)
  }

  const submit = () => {
    if (checking || locked || success || !selected) return
    if (!pw) { setError(true); return }
    setChecking(true)

    if (preview) {
      // Mockup — no IPC, fixed example password.
      setTimeout(() => {
        setChecking(false)
        if (pw === PREVIEW_PASSWORD) { setError(false); setSuccess(true) }
        else onFail()
      }, 280)
      return
    }

    const user = selected
    window.api.auth.login(user.id, pw)
      .then((authed: CurrentUser) => {
        setChecking(false)
        useUserStore.getState().login(authed)
        setError(false)
        setSuccess(true)
      })
      .catch((e: any) => {
        setChecking(false)
        // Main throws Error('LOCKED') with remainingMs when in backoff.
        const msg = String(e?.message ?? '')
        const lockMs = msg.includes('LOCKED') ? Number(e?.remainingMs) || LOCK_SECONDS * 1000 : undefined
        onFail(lockMs)
      })
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') submit()
    if (e.key === 'Escape') backToSelect()
  }

  const openRecover = () => {
    if (preview) { toast({ title: '(ตัวอย่าง) โหมดนี้ไม่กู้รหัสจริง', variant: 'default' }); return }
    setRecoverCode(''); setRecoverNewPw(''); setRecoverError(null); setRecoverView('form')
  }

  const closeRecover = () => {
    setRecoverView(null)
    setNewRecoveryCode(''); setCopied(false)
  }

  const submitRecover = () => {
    if (recoverBusy) return
    if (!recoverCode.trim()) { setRecoverError('กรุณากรอกรหัสกู้คืน'); return }
    if (recoverNewPw.trim().length < 4) { setRecoverError('รหัสผ่านใหม่ต้องมีอย่างน้อย 4 ตัวอักษร'); return }
    setRecoverBusy(true)
    setRecoverError(null)
    window.api.auth.resetAdminPassword(recoverCode.trim(), recoverNewPw.trim())
      .then((res: { recoveryCode: string }) => {
        setRecoverBusy(false)
        setNewRecoveryCode(res.recoveryCode)
        setRecoverView('done')
      })
      .catch((e: any) => {
        setRecoverBusy(false)
        const msg = String(e?.message ?? '')
        setRecoverError(msg.includes('LOCKED') ? 'พยายามหลายครั้งเกินไป กรุณารอสักครู่' : (msg || 'กู้รหัสไม่สำเร็จ'))
      })
  }

  const copyRecoveryCode = () => {
    try {
      navigator.clipboard?.writeText(newRecoveryCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* clipboard unavailable — user can read it off-screen */ }
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      <TitleBar />
      <div className="flex-1 flex min-h-0 overflow-hidden">
        <BrandPanel tagline="ระบบขายหน้าร้าน สำหรับร้านยา">
          <div className="space-y-1.5">
            <h2 className="text-2xl font-bold tracking-tight text-primary-foreground">ยินดีต้อนรับ</h2>
            <p className="text-sm text-primary-foreground/70">เข้าสู่ระบบเพื่อเริ่มต้นการทำงาน</p>
          </div>
        </BrandPanel>

        <div className="flex-1 overflow-auto">
          <div className="min-h-full flex flex-col items-center justify-center px-6 py-12">
          {/* content กลาง — ไม่มีกรอบนอก (วางบนพื้นตรง ๆ) */}
          <div className="w-full max-w-md">
            {/* หัวข้อ — ซ่อนตอน recover/success ที่มีหัวข้อของตัวเอง */}
            {!recoverView && !success && (
              <div className="text-center mb-6">
                <BrandLogo className="size-16" />
                <h1 className="text-3xl font-bold tracking-tight text-foreground mt-3">เข้าสู่ระบบ</h1>
                <p className="text-sm text-muted-foreground mt-1.5">
                  {stage === 'select' ? 'เลือกผู้ใช้ที่ต้องการเข้าสู่ระบบ' : (shopName || ' ')}
                </p>
              </div>
            )}
            {recoverView === 'form' ? (
              <div className="space-y-4 animate-in fade-in slide-in-from-right-3 duration-200 motion-reduce:animate-none">
                <div className="space-y-1">
                  <div className="text-base font-semibold text-foreground">กู้รหัสผ่านผู้ดูแล</div>
                  <div className="text-xs text-muted-foreground">
                    กรอกรหัสกู้คืน (recovery code) ที่ได้รับตอนติดตั้ง แล้วตั้งรหัสผ่านผู้ดูแลใหม่
                  </div>
                </div>

                <FormField label="รหัสกู้คืน">
                  <Input
                    value={recoverCode}
                    onChange={e => { setRecoverCode(e.target.value); if (recoverError) setRecoverError(null) }}
                    disabled={recoverBusy}
                    placeholder="XXXX-XXXX-XXXX"
                    autoFocus
                  />
                </FormField>

                <FormField label="รหัสผ่านผู้ดูแลใหม่">
                  <Input
                    type="password"
                    value={recoverNewPw}
                    onChange={e => { setRecoverNewPw(e.target.value); if (recoverError) setRecoverError(null) }}
                    onKeyDown={e => { if (e.key === 'Enter') submitRecover() }}
                    disabled={recoverBusy}
                    placeholder="••••••••"
                  />
                  {recoverError && <div className="text-xs text-destructive">{recoverError}</div>}
                </FormField>

                <div className="flex items-center gap-2">
                  <Button variant="elevated" onClick={closeRecover} disabled={recoverBusy}>
                    <ArrowLeft className="size-4" />กลับ
                  </Button>
                  <div className="flex-1" />
                  <Button onClick={submitRecover} disabled={recoverBusy}>
                    <KeyRound className="size-4" />{recoverBusy ? 'กำลังตั้งรหัส...' : 'ตั้งรหัสผ่านใหม่'}
                  </Button>
                </div>

                <div className="text-xs text-muted-foreground text-center pt-1">
                  ลืม recovery code ด้วย? ติดต่อผู้ขาย
                </div>
              </div>
            ) : recoverView === 'done' ? (
              <div className="space-y-4 animate-in fade-in zoom-in-95 duration-200 motion-reduce:animate-none">
                <div className="flex flex-col items-center gap-2 text-center">
                  <span className="flex items-center justify-center size-12 rounded-full bg-success-soft text-success">
                    <Check className="size-6" />
                  </span>
                  <div className="text-base font-semibold text-foreground">ตั้งรหัสผ่านใหม่สำเร็จ</div>
                </div>

                <div className="rounded-xl border bg-card shadow-sm p-4 space-y-2">
                  <div className="text-xs font-semibold text-foreground">รหัสกู้คืนชุดใหม่ (เก็บไว้ให้ดี — แสดงเพียงครั้งเดียว)</div>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-base font-bold tracking-widest text-foreground">{newRecoveryCode}</code>
                    <Button variant="elevated" size="icon" onClick={copyRecoveryCode}>
                      {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                    </Button>
                  </div>
                  <div className="text-xs text-amber-strong bg-amber-soft rounded-lg px-2.5 py-1.5">
                    รหัสกู้คืนเดิมใช้ไม่ได้แล้ว หากทำหายจะกู้รหัสผ่านเองไม่ได้
                  </div>
                </div>

                <Button className="w-full" onClick={closeRecover}>
                  <Check className="size-4" />เสร็จสิ้น
                </Button>
              </div>
            ) : success ? (
              <div className="flex flex-col items-center justify-center py-8 gap-3 animate-in fade-in zoom-in-95 duration-300 motion-reduce:animate-none">
                <span className="flex items-center justify-center size-14 rounded-full bg-success-soft text-success">
                  <Check className="size-7" />
                </span>
                <div className="text-sm text-muted-foreground">เข้าสู่ระบบในชื่อ {selected?.name}</div>
              </div>
            ) : loadingUsers ? (
              <div className="space-y-2.5">
                {[0, 1, 2].map(i => (
                  <div key={i} className="flex items-center gap-3.5 rounded-2xl border bg-card px-4 py-3.5 shadow-sm">
                    <div className="size-12 rounded-full bg-muted animate-pulse motion-reduce:animate-none" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-4 w-1/2 rounded bg-muted animate-pulse motion-reduce:animate-none" />
                      <div className="h-3 w-2/3 rounded bg-muted animate-pulse motion-reduce:animate-none" />
                    </div>
                  </div>
                ))}
              </div>
            ) : stage === 'select' ? (
              <div className="space-y-2.5 animate-in fade-in slide-in-from-left-3 duration-200 motion-reduce:animate-none">
                {users.length === 0 && (
                  <div className="text-sm text-muted-foreground px-1 py-4 text-center">ไม่พบผู้ใช้งานที่เปิดใช้งาน</div>
                )}
                {users.map(u => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => pickUser(u)}
                    className="group w-full flex items-center gap-3.5 rounded-2xl border bg-card px-4 py-3.5 text-left shadow-sm transition-colors hover:bg-muted/60"
                  >
                    <InitialAvatar name={u.name} size="lg" />
                    <div className="flex-1 min-w-0">
                      <div className="text-base font-semibold text-foreground truncate">{u.name}</div>
                      <div className="text-sm text-muted-foreground truncate">{u.email}</div>
                    </div>
                    <ChevronRight className="size-5 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </button>
                ))}
              </div>
            ) : (
              <div className="space-y-4 animate-in fade-in slide-in-from-right-3 duration-200 motion-reduce:animate-none">
                {/* ผู้ใช้ที่เลือก */}
                <div className="flex items-center gap-3.5 rounded-2xl border bg-card px-4 py-3 shadow-sm">
                  <InitialAvatar name={selected?.name} size="lg" />
                  <div className="flex-1 min-w-0">
                    <div className="text-base font-semibold text-foreground truncate">{selected?.name}</div>
                    <div className="text-sm text-muted-foreground truncate">{selected?.email}</div>
                  </div>
                  <span className="flex items-center justify-center size-6 rounded-full bg-primary text-primary-foreground shrink-0">
                    <Check className="size-4" />
                  </span>
                </div>

                {/* ช่องรหัสผ่าน */}
                <FormField label="รหัสผ่าน">
                  <div className={cn('relative', shaking && 'animate-shake motion-reduce:animate-none')}>
                    <Input
                      ref={pwRef}
                      type={showPw ? 'text' : 'password'}
                      value={pw}
                      onChange={e => { setPw(e.target.value); if (error) setError(false) }}
                      onKeyDown={onKeyDown}
                      disabled={checking || locked}
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
                  {error && !locked && (
                    <div className="text-xs text-destructive">รหัสผ่านไม่ถูกต้อง</div>
                  )}
                  {locked && (
                    <div className="text-xs text-destructive">ลองใหม่อีกครั้งใน {lockRemaining} วินาที</div>
                  )}
                  {preview && !error && !locked && (
                    <div className="text-xs text-muted-foreground">ตัวอย่าง: รหัสผ่านคือ 1234</div>
                  )}
                </FormField>

                {/* ปุ่ม */}
                <div className="flex items-center gap-2">
                  {!single && (
                    <Button variant="elevated" onClick={backToSelect} disabled={checking}>
                      <ArrowLeft className="size-4" />เปลี่ยนผู้ใช้
                    </Button>
                  )}
                  <div className="flex-1" />
                  <Button onClick={submit} disabled={checking || locked}>
                    <LogIn className="size-4" />{checking ? 'กำลังตรวจสอบ...' : 'เข้าสู่ระบบ'}
                  </Button>
                </div>

                {/* ลืมรหัสผ่าน */}
                <div className="text-center pt-1">
                  <Button
                    variant="elevated"
                    size="sm"
                    onClick={openRecover}
                  >
                    <KeyRound className="size-3.5" />ลืมรหัสผ่าน
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* chrome มุมล่าง — สลับธีม */}
          <div className="mt-6 flex items-center gap-1 text-muted-foreground">
            <Button variant="ghost" size="sm" onClick={toggleTheme}>
              {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
              {theme === 'dark' ? 'สว่าง' : 'มืด'}
            </Button>
          </div>

          {preview && (
            <div className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <ShieldCheck className="size-3.5" />ตัวอย่าง UI — ไม่กระทบข้อมูลจริง
            </div>
          )}
          </div>
        </div>
      </div>
    </div>
  )
}
