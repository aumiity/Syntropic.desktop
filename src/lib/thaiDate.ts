const TH_MONTHS_SHORT = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
]

// "2026-05-20" or "2026-05-20 14:30:00" → "20 พ.ค. 2569"
export function formatThaiShortBE(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso.replace(' ', 'T'))
  if (isNaN(d.getTime())) return ''
  const day = d.getDate()
  const month = TH_MONTHS_SHORT[d.getMonth()]
  const yearBE = d.getFullYear() + 543
  return `${day} ${month} ${yearBE}`
}
