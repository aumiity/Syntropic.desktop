import { useState, useCallback, useRef } from 'react'
import { ManagerOverrideDialog, type ManagerOverride } from '@/components/ui/manager-override-dialog'
import { usePermission } from '@/hooks/usePermission'

// Wraps an admin-only action so it "just works" for both roles:
//   - admin caller → runs the action immediately with no override
//   - staff caller → opens the manager-override prompt; on a verified credential
//     the action runs with that override attached. The credential is verified
//     SERVER-SIDE inside the action's IPC call (requireAdmin); if it throws, the
//     dialog stays open and shows the error.
//
// Usage:
//   const { run, dialog } = useManagerOverride()
//   ...
//   run(async (ov) => { await window.api.reports.voidSale(id, reason, ov) },
//       { title: 'ยกเลิกบิล', onDone: () => refresh() })
//   ...
//   return <>{...}{dialog}</>
//
// `run`'s action receives `ManagerOverride | undefined` to forward to the IPC
// call as the trailing `override` arg.
type Action = (override?: ManagerOverride) => Promise<void>
type RunOpts = { title?: string; description?: string; onDone?: () => void; onError?: (e: any) => void }

export function useManagerOverride() {
  const { isAdmin } = usePermission()
  const [open, setOpen] = useState(false)
  const [opts, setOpts] = useState<RunOpts>({})
  const actionRef = useRef<Action | null>(null)

  const run = useCallback((action: Action, runOpts: RunOpts = {}) => {
    if (isAdmin) {
      // Admin: no override needed; run directly. Errors go to onError (the
      // override-dialog path surfaces them inline instead).
      Promise.resolve(action(undefined))
        .then(() => runOpts.onDone?.())
        .catch((e) => runOpts.onError?.(e))
      return
    }
    actionRef.current = action
    setOpts(runOpts)
    setOpen(true)
  }, [isAdmin])

  // Called by the dialog on submit. Throws on failure so the dialog can surface
  // it and stay open; resolves (and the dialog closes itself) on success.
  const onSubmit = useCallback(async (cred: ManagerOverride) => {
    const action = actionRef.current
    if (!action) return
    await action(cred)
    opts.onDone?.()
  }, [opts])

  const dialog = (
    <ManagerOverrideDialog
      open={open}
      onOpenChange={setOpen}
      title={opts.title}
      description={opts.description}
      onSubmit={onSubmit}
    />
  )

  return { run, dialog, isAdmin }
}
