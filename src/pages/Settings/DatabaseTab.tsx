import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SectionCard } from '@/components/ui/card'
import { FormField } from '@/components/ui/label'
import { Toggle } from '@/components/ui/switch'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useToast } from '@/components/ui/toast'
import { formatDateTime } from '@/lib/utils'
import type { BackupFileInfo } from '@/types'
import { Download, Upload, History, FolderOpen, DatabaseBackup } from 'lucide-react'

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function DatabaseTab() {
  const { toast } = useToast()
  const [autoEnabled, setAutoEnabled] = useState(true)
  const [retention, setRetention] = useState(7)
  const [lastAuto, setLastAuto] = useState<string | null>(null)
  const [files, setFiles] = useState<BackupFileInfo[]>([])
  const [exporting, setExporting] = useState(false)
  const [confirmRestore, setConfirmRestore] = useState(false)
  const [restoring, setRestoring] = useState(false)

  const loadFiles = useCallback(async () => {
    setFiles(await window.api.backup.listAuto())
  }, [])

  useEffect(() => {
    window.api.backup.getSettings().then(s => {
      setAutoEnabled(!!s.auto_enabled)
      setRetention(s.retention_count)
      setLastAuto(s.last_auto_backup_at)
    })
    loadFiles()
  }, [loadFiles])

  const persist = useCallback(
    async (auto_enabled: boolean, retention_count: number) => {
      try {
        await window.api.backup.saveSettings({ auto_enabled, retention_count })
      } catch (e: any) {
        toast({ title: 'บันทึกการตั้งค่าไม่สำเร็จ', description: e?.message ?? '', variant: 'error' })
      }
    },
    [toast],
  )

  const handleExport = async () => {
    setExporting(true)
    try {
      const res = await window.api.backup.export()
      if (res.canceled) return
      if (res.ok) {
        toast({ title: 'สำรองข้อมูลสำเร็จ', description: res.path, variant: 'success' })
        loadFiles()
      } else {
        toast({ title: 'สำรองข้อมูลไม่สำเร็จ', description: res.error ?? '', variant: 'error' })
      }
    } catch (e: any) {
      toast({ title: 'สำรองข้อมูลไม่สำเร็จ', description: e?.message ?? '', variant: 'error' })
    } finally {
      setExporting(false)
    }
  }

  const handleRestore = async () => {
    if (restoring) return
    setRestoring(true)
    try {
      const res = await window.api.backup.restore()
      if (res.canceled) {
        setConfirmRestore(false)
        return
      }
      if (res.ok) {
        // App will relaunch immediately — show a brief acknowledgement.
        toast({ title: 'กำลังกู้คืนและรีสตาร์ทโปรแกรม...', variant: 'success' })
      } else {
        toast({ title: 'กู้คืนไม่สำเร็จ', description: res.error ?? '', variant: 'error' })
        setConfirmRestore(false)
      }
    } catch (e: any) {
      toast({ title: 'กู้คืนไม่สำเร็จ', description: e?.message ?? '', variant: 'error' })
      setConfirmRestore(false)
    } finally {
      setRestoring(false)
    }
  }

  return (
    <div className="max-w-3xl space-y-4 pt-2">
      {/* Export */}
      <SectionCard icon={Download} title="สำรองข้อมูล" tint="primary">
        <p className="text-sm text-muted-foreground leading-relaxed">
          บันทึกฐานข้อมูลทั้งหมด (สินค้า ล็อต การขาย ภาษี ฯลฯ) ออกเป็นไฟล์ <span className="font-mono text-xs">.db</span> เดียว
          เก็บไว้ในที่ปลอดภัย เช่น USB หรือคลาวด์ เพื่อกู้คืนได้หากเครื่องเสียหาย
        </p>
        <Button onClick={handleExport} disabled={exporting}>
          <Download className="size-4" />
          {exporting ? 'กำลังสำรอง...' : 'สำรองข้อมูลเดี๋ยวนี้'}
        </Button>
      </SectionCard>

      {/* Restore */}
      <SectionCard icon={Upload} title="กู้คืนข้อมูล" tint="warm">
        <p className="text-sm text-muted-foreground leading-relaxed">
          เลือกไฟล์สำรอง <span className="font-mono text-xs">.db</span> มาแทนที่ฐานข้อมูลปัจจุบันทั้งหมด
          ระบบจะสำรองข้อมูลปัจจุบันไว้ก่อนอัตโนมัติ แล้วรีสตาร์ทโปรแกรม
        </p>
        <Button variant="destructive" onClick={() => setConfirmRestore(true)}>
          <Upload className="size-4" /> เลือกไฟล์กู้คืน
        </Button>
      </SectionCard>

      {/* Auto-backup */}
      <SectionCard icon={DatabaseBackup} title="สำรองอัตโนมัติ" tint="info-soft">
        <p className="text-sm text-muted-foreground leading-relaxed">
          สำรองข้อมูลให้อัตโนมัติเมื่อเปิดโปรแกรม (วันละครั้ง) และเก็บไฟล์ล่าสุดตามจำนวนที่กำหนด
        </p>

        <Toggle
          framed
          size="lg"
          label="เปิดสำรองอัตโนมัติ"
          checked={autoEnabled}
          onChange={v => { setAutoEnabled(v); persist(v, retention) }}
          className="justify-between w-full"
        />

        <FormField label="จำนวนไฟล์ที่เก็บย้อนหลัง">
          <Input
            type="number"
            min={1}
            className="w-32"
            value={retention}
            onChange={e => setRetention(Math.max(1, parseInt(e.target.value) || 1))}
            onBlur={() => persist(autoEnabled, retention)}
          />
        </FormField>

        <div className="flex items-center justify-between pt-1">
          <span className="text-xs text-muted-foreground">
            สำรองอัตโนมัติล่าสุด:{' '}
            <span className="text-foreground font-medium">
              {lastAuto ? formatDateTime(lastAuto) : 'ยังไม่มี'}
            </span>
          </span>
          <Button variant="elevated" size="sm" onClick={() => window.api.backup.openFolder()}>
            <FolderOpen className="size-4" /> เปิดโฟลเดอร์สำรอง
          </Button>
        </div>

        {files.length > 0 && (
          <div className="rounded-xl border border-border bg-card shadow-sm divide-y divide-border">
            {files.map(f => (
              <div key={f.path} className="flex items-center gap-3 px-3 py-2 text-sm">
                <History className="size-4 text-muted-foreground shrink-0" />
                <span className="font-mono text-xs truncate flex-1" title={f.path}>{f.name}</span>
                <span className="text-xs text-muted-foreground shrink-0">{formatDateTime(f.mtime)}</span>
                <span className="text-xs text-foreground-subtle shrink-0 w-16 text-right">{formatSize(f.size)}</span>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <ConfirmDialog
        open={confirmRestore}
        onOpenChange={o => { if (!o && !restoring) setConfirmRestore(false) }}
        variant="destructive"
        title="กู้คืนฐานข้อมูล"
        description="เลือกไฟล์สำรองที่ต้องการนำกลับมาใช้"
        confirmLabel="เลือกไฟล์และกู้คืน"
        cancelLabel="ยกเลิก"
        busy={restoring}
        onConfirm={handleRestore}
        content={
          <div className="rounded-xl bg-destructive-soft p-3 text-sm text-destructive leading-relaxed">
            ข้อมูลปัจจุบันทั้งหมดจะถูกแทนที่ด้วยไฟล์สำรอง และโปรแกรมจะรีสตาร์ททันที
            (ระบบจะสำรองข้อมูลปัจจุบันไว้ก่อนโดยอัตโนมัติ)
          </div>
        }
      />
    </div>
  )
}
