import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { SectionCard } from '@/components/ui/card'
import { NativeSelect } from '@/components/ui/select'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { useToast } from '@/components/ui/toast'
import { Check, Save, ShieldCheck, X } from 'lucide-react'
import { PERMISSIONS, MATRIX_KEYS, EDITABLE_ROLES, isViewPerm, type PermState } from '@/lib/permissions/registry'

// Owner-only matrix: who (เภสัชกร / พนักงาน) can do what, in 3 states. The owner
// column is locked (always full). The owner-only permission.manage key is never a
// row here (MATRIX_KEYS excludes it), so the owner can never lock themselves out
// of this page. Real enforcement is requirePermission in main — this just edits
// the role_permissions data it reads.

const STATE_LABEL: Record<PermState, string> = { off: 'ปิด', allow: 'เปิด', override: 'ต้องขออนุมัติ' }
const ACTION_STATES: PermState[] = ['off', 'allow', 'override']
const VIEW_STATES: PermState[] = ['off', 'allow']

const keyOf = (role: string, perm: string) => `${role}:${perm}`
const MATRIX_PERMS = PERMISSIONS.filter((p) => MATRIX_KEYS.includes(p.key))

export function PermissionsTab({ onActions }: { onActions?: (node: ReactNode) => void }) {
  const { toast } = useToast()
  const [original, setOriginal] = useState<Record<string, PermState>>({})
  const [draft, setDraft] = useState<Record<string, PermState>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let alive = true
    window.api.permissions.getMatrix()
      .then((rows) => {
        if (!alive) return
        const map: Record<string, PermState> = {}
        for (const r of rows) map[keyOf(r.role, r.permission)] = r.state
        setOriginal(map)
        setDraft(map)
      })
      .catch(() => {})
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  const dirty = useMemo(
    () => Object.keys(draft).some((k) => draft[k] !== original[k]),
    [draft, original],
  )

  const setCell = (role: string, perm: string, state: PermState) =>
    setDraft((d) => ({ ...d, [keyOf(role, perm)]: state }))

  const handleSave = () => {
    if (saving || !dirty) return
    const changes = Object.keys(draft)
      .filter((k) => draft[k] !== original[k])
      .map((k) => { const [role, permission] = k.split(':'); return { role, permission, state: draft[k] } })
    setSaving(true)
    window.api.permissions.save(changes)
      .then(() => {
        setOriginal({ ...draft })
        toast({ title: 'บันทึกสิทธิ์แล้ว', description: 'ผู้ที่ล็อกอินค้างต้องเข้าสู่ระบบใหม่จึงเห็นผลค่ะ', variant: 'success' })
      })
      .catch((e: any) => toast({ title: 'บันทึกไม่สำเร็จ', description: e?.message ?? '', variant: 'error' }))
      .finally(() => setSaving(false))
  }

  const handleCancel = () => { if (!saving) setDraft({ ...original }) }

  // Lift บันทึก/ยกเลิก to the Settings tab row (ref keeps the published node from
  // going stale without re-registering every render — mirrors DocumentSettingsTab).
  const actRef = useRef({ handleSave, handleCancel })
  actRef.current = { handleSave, handleCancel }
  useEffect(() => {
    onActions?.(
      <div className="ml-auto flex items-center gap-2">
        <Button variant="elevated" className="h-10" onClick={() => actRef.current.handleCancel()} disabled={saving || !dirty}>
          <X className="size-4" />ยกเลิก
        </Button>
        <Button className="h-10" onClick={() => actRef.current.handleSave()} disabled={saving || !dirty}>
          <Save className="size-4" />{saving ? 'กำลังบันทึก...' : 'บันทึก'}
        </Button>
      </div>,
    )
    return () => onActions?.(null)
  }, [onActions, saving, dirty])

  const groups = useMemo(() => {
    const order: string[] = []
    const byGroup: Record<string, typeof MATRIX_PERMS> = {}
    for (const p of MATRIX_PERMS) {
      if (!byGroup[p.group]) { byGroup[p.group] = []; order.push(p.group) }
      byGroup[p.group].push(p)
    }
    return order.map((g) => ({ group: g, perms: byGroup[g] }))
  }, [])

  if (loading) return <div className="py-8 text-center text-sm text-muted-foreground">กำลังโหลด…</div>

  return (
    <div className="flex flex-col gap-3 py-1">
      <p className="text-sm text-muted-foreground">
        กำหนดว่าเภสัชกรและพนักงานทำอะไรได้บ้าง — <b>ปิด</b> (ทำไม่ได้) · <b>เปิด</b> (ทำได้เลย) · <b>ต้องขออนุมัติ</b> (ทำได้เมื่อมีผู้มีสิทธิ์มาอนุมัติ) เจ้าของร้านมีสิทธิ์ครบทุกอย่างเสมอค่ะ
      </p>
      <SectionCard title="สิทธิ์การใช้งานตามตำแหน่ง" icon={ShieldCheck}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[40%]">สิทธิ์</TableHead>
              <TableHead className="w-[20%] text-center">เจ้าของร้าน</TableHead>
              <TableHead className="w-[20%]">เภสัชกร</TableHead>
              <TableHead className="w-[20%]">พนักงาน</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {groups.map(({ group, perms }) => (
              <Fragment key={group}>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableCell colSpan={4} className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group}</TableCell>
                </TableRow>
                {perms.map((p) => {
                  const states = isViewPerm(p.key) ? VIEW_STATES : ACTION_STATES
                  return (
                    <TableRow key={p.key}>
                      <TableCell className="text-sm">{p.label}</TableCell>
                      <TableCell className="text-center">
                        <Check className="inline size-4 text-muted-foreground" aria-label="เปิดเสมอ" />
                      </TableCell>
                      {EDITABLE_ROLES.map((role) => (
                        <TableCell key={role}>
                          <NativeSelect value={draft[keyOf(role, p.key)] ?? 'off'} onChange={(v) => setCell(role, p.key, v as PermState)}>
                            {states.map((s) => <option key={s} value={s}>{STATE_LABEL[s]}</option>)}
                          </NativeSelect>
                        </TableCell>
                      ))}
                    </TableRow>
                  )
                })}
              </Fragment>
            ))}
          </TableBody>
        </Table>
      </SectionCard>
    </div>
  )
}
