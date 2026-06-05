import { scryptSync, randomBytes, timingSafeEqual } from 'crypto'

// Password / secret hashing for login + recovery code. Node crypto only (no
// external dep — npm install is forbidden, see CLAUDE.md). Params are pinned and
// embedded in the stored string so they can be bumped later without a migration:
//   scrypt$<N>$<r>$<p>$<salt_hex>$<hash_hex>
const N = 16384
const r = 8
const p = 1
const SALT_BYTES = 16
const KEY_LEN = 32

export function hashSecret(plain: string): string {
  const salt = randomBytes(SALT_BYTES)
  const key = scryptSync(plain, salt, KEY_LEN, { N, r, p })
  return `scrypt$${N}$${r}$${p}$${salt.toString('hex')}$${key.toString('hex')}`
}

// Verify a plaintext against a stored value. `legacy` = the stored value is a
// pre-hash plaintext (seed installs) compared directly — the caller should
// re-hash and persist on a successful legacy match (upgrade-on-login).
export function verifySecret(plain: string, stored: string): { ok: boolean; legacy: boolean } {
  if (!stored.startsWith('scrypt$')) {
    return { ok: plain === stored, legacy: true }
  }
  const parts = stored.split('$')
  // scrypt $ N $ r $ p $ salt $ hash  → 6 segments
  if (parts.length !== 6) return { ok: false, legacy: false }
  const [, nStr, rStr, pStr, saltHex, hashHex] = parts
  const salt = Buffer.from(saltHex, 'hex')
  const expected = Buffer.from(hashHex, 'hex')
  const actual = scryptSync(plain, salt, expected.length, {
    N: Number(nStr),
    r: Number(rStr),
    p: Number(pStr),
  })
  // timingSafeEqual throws on length mismatch — guard first.
  if (actual.length !== expected.length) return { ok: false, legacy: false }
  return { ok: timingSafeEqual(actual, expected), legacy: false }
}

// Crockford base32 alphabet (no I/L/O/U to avoid transcription errors).
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

// 12-char recovery code formatted XXXX-XXXX-XXXX. Shown once at setup; only its
// hash is stored.
export function genRecoveryCode(): string {
  const bytes = randomBytes(12)
  let out = ''
  for (let i = 0; i < 12; i++) out += CROCKFORD[bytes[i] % 32]
  return `${out.slice(0, 4)}-${out.slice(4, 8)}-${out.slice(8, 12)}`
}
