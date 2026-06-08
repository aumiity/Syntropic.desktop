import { scryptSync, randomBytes, timingSafeEqual } from 'crypto';
// Password / secret hashing for login + recovery code. Node crypto only (no
// external dep — npm install is forbidden, see CLAUDE.md). Params are pinned and
// embedded in the stored string so they can be bumped later without a migration:
//   scrypt$<N>$<r>$<p>$<salt_hex>$<hash_hex>
var N = 16384;
var r = 8;
var p = 1;
var SALT_BYTES = 16;
var KEY_LEN = 32;
export function hashSecret(plain) {
    var salt = randomBytes(SALT_BYTES);
    var key = scryptSync(plain, salt, KEY_LEN, { N: N, r: r, p: p });
    return "scrypt$".concat(N, "$").concat(r, "$").concat(p, "$").concat(salt.toString('hex'), "$").concat(key.toString('hex'));
}
// Verify a plaintext against a stored value. `legacy` = the stored value is a
// pre-hash plaintext (seed installs) compared directly — the caller should
// re-hash and persist on a successful legacy match (upgrade-on-login).
export function verifySecret(plain, stored) {
    if (!stored.startsWith('scrypt$')) {
        return { ok: plain === stored, legacy: true };
    }
    var parts = stored.split('$');
    // scrypt $ N $ r $ p $ salt $ hash  → 6 segments
    if (parts.length !== 6)
        return { ok: false, legacy: false };
    var nStr = parts[1], rStr = parts[2], pStr = parts[3], saltHex = parts[4], hashHex = parts[5];
    var salt = Buffer.from(saltHex, 'hex');
    var expected = Buffer.from(hashHex, 'hex');
    var actual = scryptSync(plain, salt, expected.length, {
        N: Number(nStr),
        r: Number(rStr),
        p: Number(pStr),
    });
    // timingSafeEqual throws on length mismatch — guard first.
    if (actual.length !== expected.length)
        return { ok: false, legacy: false };
    return { ok: timingSafeEqual(actual, expected), legacy: false };
}
// Crockford base32 alphabet (no I/L/O/U to avoid transcription errors).
var CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
// 12-char recovery code formatted XXXX-XXXX-XXXX. Shown once at setup; only its
// hash is stored.
export function genRecoveryCode() {
    var bytes = randomBytes(12);
    var out = '';
    for (var i = 0; i < 12; i++)
        out += CROCKFORD[bytes[i] % 32];
    return "".concat(out.slice(0, 4), "-").concat(out.slice(4, 8), "-").concat(out.slice(8, 12));
}
