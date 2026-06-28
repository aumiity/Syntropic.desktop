import { useState, useCallback, useRef } from 'react'
import { ManagerOverrideDialog, type ManagerOverride } from '@/components/ui/manager-override-dialog'
import { useUserStore } from '@/stores/userStore'
import { resolveCan } from '@/hooks/useCan'

// Wraps a permission-gated action so it "just works" for every role, driven by
// the action's permission KEY (not a fixed admin check):
//   - state 'allow'    → runs INLINE, no prompt (owner, or any role granted it)
//   - state 'override' → opens the manager-override prompt; on a verified
//     approver credential the action runs with that override attached. The
//     credential is verified SERVER-SIDE by requirePermission(e, permKey, ov);
//     if it throws, the dialog stays open and surfaces the error.
//   - state 'off'      → no-op (the triggering control should already be hidden
//     via useCan; this is just a defensive fallback).
//
// run() returns its resolution SYNCHRONOUSLY so a caller can clear a triggering
// button's busy flag in the non-inline paths (the inline path clears it in
// onDone/onError instead). This replaces the old `!isAdmin` heuristic, which
// wrongly treated a pharmacist's inline 'allow' as a prompt.
//
// Usage:
//   const { run, dialog } = useManagerOverride()
//   const mode = run(async (ov) => { await window.api.reports.voidSale(id, reason, ov) },
//       { permKey: 'sale.void', title: 'ยกเลิกบิล', onDone: () => refresh(), onError: ... })
//   if (mode !== 'inline') setBusy(false)
//   ...
//   return <>{...}{dialog}</>
type Action = (override?: ManagerOverride) => Promise<void>
export type RunMode = 'inline' | 'prompt' | 'noop'
// permKey is REQUIRED — tsc forces every call site to declare the permission it
// gates, so a stale/missing key can't silently fall through.
type RunOpts = {
  permKey: string
  title?: string
  description?: string
  onDone?: () => void
  onError?: (e: any) => void
}

export function useManagerOverride() {
  const [open, setOpen] = useState(false)
  const [opts, setOpts] = useState<RunOpts | null>(null)
  const actionRef = useRef<Action | null>(null)

  const run = useCallback((action: Action, runOpts: RunOpts): RunMode => {
    // Resolve the caller's state for THIS action's key imperatively (the key is
    // only known at call time, so we read the store rather than call useCan).
    const state = resolveCan(useUserStore.getState().current, runOpts.permKey)

    if (state === 'off') return 'noop'

    if (state === 'allow') {
      // Inline: no override needed. Errors go to onError (the dialog path
      // surfaces them inline and stays open instead).
      Promise.resolve(action(undefined))
        .then(() => runOpts.onDone?.())
        .catch((e) => runOpts.onError?.(e))
      return 'inline'
    }

    // 'override' — prompt for an approver credential.
    actionRef.current = action
    setOpts(runOpts)
    setOpen(true)
    return 'prompt'
  }, [])

  // Called by the dialog on submit. Throws on failure so the dialog can surface
  // it and stay open; resolves (and the dialog closes itself) on success.
  const onSubmit = useCallback(async (cred: ManagerOverride) => {
    const action = actionRef.current
    if (!action) return
    await action(cred)
    opts?.onDone?.()
  }, [opts])

  const dialog = (
    <ManagerOverrideDialog
      open={open}
      onOpenChange={setOpen}
      permKey={opts?.permKey ?? ''}
      title={opts?.title}
      description={opts?.description}
      onSubmit={onSubmit}
    />
  )

  return { run, dialog }
}
