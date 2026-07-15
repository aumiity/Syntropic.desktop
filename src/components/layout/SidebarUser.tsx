import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronsUpDown, User, UserPen, LogOut, KeyRound } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover'
import {
  Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { FormField } from '@/components/ui/label'
import { InitialAvatar } from '@/components/ui/avatar'
import { useToast } from '@/components/ui/toast'
import { useUserStore } from '@/stores/userStore'

const ROLE_LABEL: Record<string, string> = { owner: 'เจ้าของร้าน', pharmacist: 'เภสัชกร', staff: 'พนักงาน' }

interface MyProfile {
  id: number; name: string; first_name: string; last_name: string
  username: string; email: string; phone: string | null; role: string
}

function RoleBadge({ role }: { role: string }) {
  const label = ROLE_LABEL[role] ?? role
  if (role === 'owner') return <Badge variant="primary-soft">{label}</Badge>
  if (role === 'pharmacist') return <Badge variant="info-soft">{label}</Badge>
  return <Badge variant="secondary">{label}</Badge>
}

const menuItem =
  'flex items-center gap-2.5 w-full px-2 py-2 rounded-md text-sm text-foreground ' +
  'hover:bg-primary-soft/60 transition-colors text-left'

function ProfileRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2.5">
      <span className="text-sm text-muted-foreground shrink-0">{label}</span>
      <span className="text-sm font-medium text-muted-foreground truncate">{value}</span>
    </div>
  )
}

export function SidebarUser({ collapsed }: { collapsed: boolean }) {
  const navigate = useNavigate()
  const { toast } = useToast()
  const current = useUserStore(s => s.current)
  const [menuOpen, setMenuOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [pwOpen, setPwOpen] = useState(false)

  // The user store is null on the login/setup screens, but the sidebar only
  // mounts behind the LoginGate — guard anyway so a stray render can't crash.
  if (!current) return null

  const roleLabel = ROLE_LABEL[current.role] ?? current.role

  const trigger = collapsed ? (
    <button
      type="button"
      className="group relative flex items-center justify-center h-14 w-full rounded-lg transition-colors text-sidebar-foreground hover:text-sidebar-accent-foreground"
    >
      <span
        aria-hidden
        className="absolute inset-0 rounded-lg transition-colors group-hover:bg-sidebar-accent/40"
      />
      <span className="relative z-10"><InitialAvatar name={current.name} size="default" /></span>
    </button>
  ) : (
    <button
      type="button"
      className="group relative flex items-center gap-2 h-14 w-full px-2.5 rounded-lg transition-colors text-sidebar-foreground hover:text-sidebar-accent-foreground"
    >
      <span
        aria-hidden
        className="absolute inset-0 rounded-lg transition-colors group-hover:bg-sidebar-accent/40"
      />
      <span className="relative z-10 shrink-0"><InitialAvatar name={current.name} size="default" /></span>
      <span className="relative z-10 flex-1 min-w-0 text-left">
        <span className="block text-sm font-bold leading-tight truncate">{current.name}</span>
        <span className="block text-xs leading-tight truncate text-sidebar-foreground/70">
          {roleLabel}
        </span>
      </span>
      <ChevronsUpDown className="relative z-10 size-4 shrink-0 opacity-70" />
    </button>
  )

  const goEdit = () => { setMenuOpen(false); navigate('/people?tab=staff') }

  return (
    <>
      <Popover open={menuOpen} onOpenChange={setMenuOpen}>
        {collapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>{trigger}</PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent>{current.name}</TooltipContent>
          </Tooltip>
        ) : (
          <PopoverTrigger asChild>{trigger}</PopoverTrigger>
        )}
        <PopoverContent side="right" align="end" sideOffset={12} className="w-60 gap-0 p-1.5">
          <div className="flex items-center gap-2.5 px-2 py-2">
            <InitialAvatar name={current.name} size="default" />
            <div className="min-w-0">
              <div className="text-sm font-semibold text-foreground truncate">{current.name}</div>
              <div className="text-xs text-muted-foreground truncate">{roleLabel}</div>
            </div>
          </div>

          <div className="my-1 h-px bg-border" />

          <button type="button" className={menuItem} onClick={() => { setMenuOpen(false); setProfileOpen(true) }}>
            <User className="size-4" />โปรไฟล์
          </button>
          <button type="button" className={menuItem} onClick={goEdit}>
            <UserPen className="size-4" />แก้ไขโปรไฟล์
          </button>
          <button type="button" className={menuItem} onClick={() => { setMenuOpen(false); setPwOpen(true) }}>
            <KeyRound className="size-4" />เปลี่ยนรหัสผ่าน
          </button>

          <div className="my-1 h-px bg-border" />

          <button
            type="button"
            className={cn(menuItem, 'text-destructive hover:bg-destructive-soft')}
            onClick={() => { setMenuOpen(false); useUserStore.getState().logout() }}
          >
            <LogOut className="size-4" />ออกจากระบบ
          </button>
        </PopoverContent>
      </Popover>

      <ProfileDialog
        open={profileOpen}
        onOpenChange={setProfileOpen}
        fallbackName={current.name}
        fallbackRole={current.role}
        onEdit={() => { setProfileOpen(false); navigate('/people?tab=staff') }}
      />

      <ChangePasswordDialog
        open={pwOpen}
        onOpenChange={setPwOpen}
        onSuccess={() => toast({ title: 'เปลี่ยนรหัสผ่านสำเร็จ', variant: 'success' })}
      />
    </>
  )
}

// Basic profile card. Pulls the caller's own full profile from main on open
// (the session store only holds id/name/role).
function ProfileDialog({
  open, onOpenChange, fallbackName, fallbackRole, onEdit,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  fallbackName: string
  fallbackRole: string
  onEdit: () => void
}) {
  const [profile, setProfile] = useState<MyProfile | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    let alive = true
    setLoading(true)
    window.api.auth.getMyProfile()
      .then((p: MyProfile) => { if (alive) setProfile(p) })
      .catch(() => { if (alive) setProfile(null) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [open])

  const name = profile?.name || fallbackName
  const role = profile?.role || fallbackRole
  const fullName = profile
    ? [profile.first_name, profile.last_name].filter(Boolean).join(' ').trim() || profile.name
    : fallbackName

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>โปรไฟล์</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="flex flex-col items-center gap-3 py-1">
            <InitialAvatar name={name} size="default" className="size-16" />
            <div className="flex flex-col items-center gap-2">
              <div className="text-lg font-semibold text-foreground">{fullName}</div>
              <RoleBadge role={role} />
            </div>
          </div>

          <div className="mt-4 rounded-xl border bg-card shadow-sm divide-y divide-border">
            <ProfileRow label="ชื่อ-นามสกุล" value={fullName} />
            <ProfileRow label="ชื่อผู้ใช้" value={profile?.username ? `${profile.username}` : (loading ? '…' : '-')} />
            <ProfileRow label="อีเมล" value={profile?.email || (loading ? '…' : '-')} />
            <ProfileRow label="เบอร์โทร" value={profile?.phone || (loading ? '…' : '-')} />
            <ProfileRow label="สิทธิ์การใช้งาน" value={ROLE_LABEL[role] ?? role} />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="elevated" onClick={onEdit}>แก้ไขโปรไฟล์</Button>
          <Button onClick={() => onOpenChange(false)}>ปิด</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// Self-service password change — available to every role.
function ChangePasswordDialog({
  open, onOpenChange, onSuccess,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onSuccess: () => void
}) {
  const { toast } = useToast()
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [saving, setSaving] = useState(false)

  // Reset fields whenever the dialog opens.
  useEffect(() => {
    if (open) { setCurrentPw(''); setNewPw(''); setConfirmPw(''); setSaving(false) }
  }, [open])

  const submit = () => {
    if (saving) return
    if (!currentPw) { toast({ title: 'กรุณากรอกรหัสผ่านปัจจุบัน', variant: 'error' }); return }
    if (newPw.length < 4) { toast({ title: 'รหัสผ่านใหม่ต้องมีอย่างน้อย 4 ตัวอักษร', variant: 'error' }); return }
    if (newPw !== confirmPw) { toast({ title: 'รหัสผ่านใหม่และการยืนยันไม่ตรงกัน', variant: 'error' }); return }
    setSaving(true)
    window.api.auth.changePassword(currentPw, newPw)
      .then(() => { onOpenChange(false); onSuccess() })
      .catch((e: any) => toast({ title: 'เปลี่ยนรหัสผ่านไม่สำเร็จ', description: e?.message ?? '', variant: 'error' }))
      .finally(() => setSaving(false))
  }

  const onEnter = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); submit() }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>เปลี่ยนรหัสผ่าน</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <FormField label="รหัสผ่านปัจจุบัน">
            <Input type="password" value={currentPw} autoFocus
              onChange={e => setCurrentPw(e.target.value)} onKeyDown={onEnter} placeholder="••••••••" />
          </FormField>
          <FormField label="รหัสผ่านใหม่">
            <Input type="password" value={newPw}
              onChange={e => setNewPw(e.target.value)} onKeyDown={onEnter} placeholder="อย่างน้อย 4 ตัวอักษร" />
          </FormField>
          <FormField label="ยืนยันรหัสผ่านใหม่">
            <Input type="password" value={confirmPw}
              onChange={e => setConfirmPw(e.target.value)} onKeyDown={onEnter} placeholder="••••••••" />
          </FormField>
        </DialogBody>
        <DialogFooter>
          <Button variant="elevated" onClick={() => onOpenChange(false)}>ยกเลิก</Button>
          <Button onClick={submit} disabled={saving}>บันทึก</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
