import { useState, useEffect, useRef } from 'react'
import { TitleBar } from '@/components/layout/TitleBar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FormField } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { InitialAvatar } from '@/components/ui/avatar'
import { useToast } from '@/components/ui/toast'
import { useThemeStore } from '@/stores/themeStore'
import { cn } from '@/lib/utils'
import { Eye, EyeOff, LogIn, ArrowLeft, ChevronRight, ShieldCheck, Check, Sun, Moon, KeyRound } from 'lucide-react'

// Login screen (ชั้น C) — เลือกผู้ใช้ + ใส่ password. ดู design brief:
// docs/plans/Login_UI_Design.md และ logic: docs/plans/User_Login_System.md
//
// preview: โหมด mockup สำหรับปุ่ม DEV ในหน้า Settings — ใช้ผู้ใช้ตัวอย่าง,
// ไม่เรียก auth IPC จริง, ไม่แตะข้อมูล. รหัสตัวอย่างคือ "1234". เมื่อเชื่อม
// backend จริง (Phase 2) จะสลับ mock list/verify เป็น window.api.auth.* แทน.

type LoginUser = { id: number; name: string; role: 'admin' | 'staff' }

const PREVIEW_USERS: LoginUser[] = [
  { id: 1, name: 'อุ้ม', role: 'admin' },
  { id: 2, name: 'บี', role: 'staff' },
  { id: 3, name: 'มินต์', role: 'staff' },
]
const PREVIEW_PASSWORD = '1234'
const LOCK_THRESHOLD = 5
const LOCK_SECONDS = 30

function RoleBadge({ role }: { role: 'admin' | 'staff' }) {
  return role === 'admin'
    ? <Badge variant="primary-soft">ผู้ดูแล</Badge>
    : <Badge variant="secondary">พนักงาน</Badge>
}

export function LoginScreen({ onComplete, preview = false }: { onComplete?: () => void; preview?: boolean }) {
  const { toast } = useToast()
  const toggleTheme = useThemeStore(s => s.toggleTheme)
  const theme = useThemeStore(s => s.theme)

  const users = PREVIEW_USERS
  const single = users.length === 1

  const [selected, setSelected] = useState<LoginUser | null>(single ? users[0] : null)
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

  const stage = selected ? 'password' : 'select'
  const lockRemaining = lockUntil ? Math.max(0, Math.ceil((lockUntil - now) / 1000)) : 0
  const locked = lockRemaining > 0

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

  const submit = () => {
    if (checking || locked || success || !selected) return
    if (!pw) { setError(true); return }
    setChecking(true)
    // Simulate the verify round-trip (real flow: window.api.auth.login).
    setTimeout(() => {
      setChecking(false)
      const ok = preview ? pw === PREVIEW_PASSWORD : false
      if (ok) {
        setError(false)
        setSuccess(true)
      } else {
        const n = fails + 1
        setFails(n)
        setError(true)
        setShaking(true)
        setPw('')
        if (n >= LOCK_THRESHOLD) setLockUntil(Date.now() + LOCK_SECONDS * 1000)
        setTimeout(() => pwRef.current?.focus(), 0)
      }
    }, 280)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') submit()
    if (e.key === 'Escape') backToSelect()
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      <TitleBar />
      <div className="flex-1 overflow-auto">
        <div className="min-h-full flex flex-col items-center justify-center px-6 py-12">
          {/* ชื่อร้าน + หัวข้อ */}
          <div className="text-center mb-6">
            <div className="text-sm font-medium text-primary">ร้านยาตัวอย่าง</div>
            <h1 className="text-2xl font-semibold text-foreground mt-1">เข้าสู่ระบบ</h1>
          </div>

          {/* การ์ดกลาง */}
          <div className="w-full max-w-md rounded-card border bg-card shadow-card p-6">
            {success ? (
              <div className="flex flex-col items-center justify-center py-8 gap-3 animate-in fade-in zoom-in-95 duration-300 motion-reduce:animate-none">
                <span className="flex items-center justify-center size-14 rounded-full bg-success-soft text-success">
                  <Check className="size-7" />
                </span>
                <div className="text-sm text-muted-foreground">เข้าสู่ระบบในชื่อ {selected?.name}</div>
              </div>
            ) : stage === 'select' ? (
              <div className="space-y-2 animate-in fade-in slide-in-from-left-3 duration-200 motion-reduce:animate-none">
                <div className="text-sm text-muted-foreground px-1 pb-1">เลือกผู้ใช้</div>
                {users.map(u => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => pickUser(u)}
                    className="w-full flex items-center gap-3 rounded-xl border bg-card px-3 py-2.5 text-left transition-colors hover:border-primary/40 hover:bg-primary/5"
                  >
                    <InitialAvatar name={u.name} size="default" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-foreground">{u.name}</div>
                    </div>
                    <RoleBadge role={u.role} />
                    <ChevronRight className="size-4 text-muted-foreground" />
                  </button>
                ))}
              </div>
            ) : (
              <div className="space-y-4 animate-in fade-in slide-in-from-right-3 duration-200 motion-reduce:animate-none">
                {/* ผู้ใช้ที่เลือก */}
                <div className="flex items-center gap-3">
                  <InitialAvatar name={selected?.name} size="default" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-foreground">{selected?.name}</div>
                    <div className="text-xs text-muted-foreground">เข้าสู่ระบบในชื่อ {selected?.name}</div>
                  </div>
                  {selected && <RoleBadge role={selected.role} />}
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
                    variant="link"
                    size="sm"
                    onClick={() => toast({ title: '(ตัวอย่าง) ไปหน้ากู้รหัสผ่านด้วย recovery code', variant: 'default' })}
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
  )
}
