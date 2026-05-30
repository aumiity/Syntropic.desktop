import React, { createContext, useContext, useState, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from 'lucide-react'

type ToastType = 'success' | 'error' | 'warning' | 'info'

interface Toast {
  id: string
  title: string
  description?: string
  type: ToastType
  duration?: number
}

// Accept both legacy positional form `toast('msg', 'success')` and the
// shadcn-style options object `toast({ title, description, variant })`.
// Centralising the normalisation here means call sites can use whichever
// form is convenient without breaking the renderer.
type ToastVariant = ToastType | 'destructive' | 'default'
interface ToastOptions {
  title: string
  description?: string
  variant?: ToastVariant
}
type ToastInput = string | ToastOptions

interface ToastContextValue {
  toast: (input: ToastInput, type?: ToastType, duration?: number) => void
}

const ToastContext = createContext<ToastContextValue>({ toast: () => {} })

function variantToType(v: ToastVariant | undefined): ToastType {
  if (v === 'destructive' || v === 'error') return 'error'
  if (v === 'warning') return 'warning'
  if (v === 'success') return 'success'
  return 'info'
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const toast = useCallback((input: ToastInput, type: ToastType = 'success', duration = 3000) => {
    const id = Math.random().toString(36).slice(2)
    const next: Toast =
      typeof input === 'string'
        ? { id, title: input, type, duration }
        : {
            id,
            title: input.title,
            description: input.description,
            type: variantToType(input.variant),
            duration,
          }
    setToasts(prev => [...prev, next])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== next.id)), duration)
  }, [])

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
        {toasts.map(t => (
          <div
            key={t.id}
            className={cn(
              'pointer-events-auto flex items-start gap-3 rounded-lg border px-4 py-3 shadow-lg text-sm min-w-[280px] max-w-sm animate-in slide-in-from-right',
              t.type === 'success' && 'bg-success-soft border-success/30 text-success',
              t.type === 'error' && 'bg-destructive-soft border-destructive/30 text-destructive',
              t.type === 'warning' && 'bg-warm border-warning/40 text-warm-foreground',
              t.type === 'info' && 'bg-primary-soft border-primary-soft-border text-primary',
            )}
          >
            {t.type === 'success' && <CheckCircle className="h-4 w-4 shrink-0 mt-0.5" />}
            {t.type === 'error' && <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />}
            {t.type === 'warning' && <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />}
            {t.type === 'info' && <Info className="h-4 w-4 shrink-0 mt-0.5" />}
            <div className="flex-1 min-w-0">
              <div className="font-medium">{t.title}</div>
              {t.description && <div className="text-xs opacity-80 mt-0.5">{t.description}</div>}
            </div>
            <button onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))}>
              <X className="h-3 w-3 opacity-60" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContext(ToastContext)
}
