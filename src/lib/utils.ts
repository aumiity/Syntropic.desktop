import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import dayjs from 'dayjs'
import 'dayjs/locale/th'
import buddhistEra from 'dayjs/plugin/buddhistEra'

dayjs.extend(buddhistEra)
dayjs.locale('th')

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(value: number): string {
  return value.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function formatDate(date: string | null | undefined, format = 'DD/MM/YYYY'): string {
  if (!date) return '-'
  return dayjs(date).format(format)
}

export function formatDateTime(date: string | null | undefined): string {
  if (!date) return '-'
  return dayjs(date).format('DD/MM/YYYY HH:mm')
}

export function getExpiryStatus(expiryDate: string | null | undefined): 'normal' | 'warning' | 'danger' | 'expired' {
  if (!expiryDate) return 'normal'
  const days = dayjs(expiryDate).diff(dayjs(), 'day')
  if (days < 0) return 'expired'
  if (days <= 30) return 'danger'
  if (days <= 60) return 'warning'
  return 'normal'
}

export function formatExpiry(expiryDate: string | null | undefined): string {
  if (!expiryDate) return 'ไม่มีวันหมดอายุ'
  const days = dayjs(expiryDate).diff(dayjs(), 'day')
  const dateStr = formatDate(expiryDate)
  if (days < 0) return `หมดอายุแล้ว (${dateStr})`
  if (days === 0) return `หมดอายุวันนี้`
  return `${dateStr}`
}

export function generateInvoiceNo(prefix: string, existingCount: number): string {
  const today = dayjs().format('YYYYMMDD')
  return `${prefix}-${today}-${String(existingCount + 1).padStart(4, '0')}`
}

declare global {
  interface Window {
    api: import('@electron/preload').ElectronAPI
  }
}
