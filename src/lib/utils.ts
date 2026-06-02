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

// Spell a money amount as Thai words (e.g. 4200 → "สี่พันสองร้อยบาทถ้วน").
// Handles millions via recursion, the สิบ/ยี่สิบ/เอ็ด rules, and satang.
export function bahtText(value: number): string {
  if (!isFinite(value)) return ''
  const num = Math.round(Math.abs(value) * 100) / 100
  const baht = Math.floor(num)
  const satang = Math.round((num - baht) * 100)

  const digits = ['', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า']
  const places = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน']

  // Read an integer in the 0..999,999 range.
  const readChunk = (n: number): string => {
    const s = String(n)
    let out = ''
    for (let i = 0; i < s.length; i++) {
      const d = Number(s[i])
      const place = s.length - 1 - i
      if (d === 0) continue
      if (place === 0 && d === 1 && s.length > 1) { out += 'เอ็ด'; continue }
      if (place === 1 && d === 1) { out += 'สิบ'; continue }
      if (place === 1 && d === 2) { out += 'ยี่สิบ'; continue }
      out += digits[d] + places[place]
    }
    return out
  }

  // Recurse on groups of a million so any magnitude reads correctly.
  const readInt = (n: number): string => {
    if (n === 0) return 'ศูนย์'
    const millions = Math.floor(n / 1_000_000)
    const rest = n % 1_000_000
    return (millions > 0 ? readInt(millions) + 'ล้าน' : '') + (rest > 0 ? readChunk(rest) : '')
  }

  return readInt(baht) + 'บาท' + (satang > 0 ? readChunk(satang) + 'สตางค์' : 'ถ้วน')
}

export function formatDate(date: string | null | undefined, format = 'DD/MM/YYYY'): string {
  if (!date) return '-'
  return dayjs(date).format(format)
}

export function formatThaiDateHeader(date: Date): string {
  return dayjs(date).format('dddd, D MMMM BBBB')
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
