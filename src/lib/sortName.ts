// Name-sort with bucket priority: digit → English → symbol/other → Thai.
// Use for any client-side sort of human-readable names (สินค้า, ลูกค้า, etc.).
// Within each bucket, localeCompare gives natural ordering — numeric:true so
// "2" sorts before "10", sensitivity:'base' so case/accent don't disrupt.

const bucket = (s: string): 0 | 1 | 2 | 3 => {
  const c = s.trim().charAt(0)
  if (!c) return 2
  const code = c.charCodeAt(0)
  if (code >= 0x30 && code <= 0x39) return 0
  if ((code >= 0x41 && code <= 0x5A) || (code >= 0x61 && code <= 0x7A)) return 1
  if (code >= 0x0E00 && code <= 0x0E7F) return 3
  return 2
}

export function compareNameBuckets(a: string, b: string): number {
  const an = a ?? ''
  const bn = b ?? ''
  const ab = bucket(an)
  const bb = bucket(bn)
  if (ab !== bb) return ab - bb
  return an.localeCompare(bn, ab === 3 ? 'th' : 'en', { numeric: true, sensitivity: 'base' })
}
