// Office kiosk code: TOTP (RFC 6238) with HMAC-SHA1, 30-second steps and 6 digits.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const KIOSK_STEP_S = 30;
export const KIOSK_DIGITS = 6;

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Buffer {
  const clean = s.toUpperCase().replace(/=+$/, '').replace(/\s/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx === -1) throw new Error('Invalid base32');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function newKioskSecret(): string {
  return base32Encode(randomBytes(20));
}

/** HOTP (RFC 4226) for a counter. */
export function hotp(secret: Buffer, counter: number, digits = KIOSK_DIGITS): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac('sha1', secret).update(msg).digest();
  const offset = h[h.length - 1]! & 0x0f;
  const bin =
    ((h[offset]! & 0x7f) << 24) |
    ((h[offset + 1]! & 0xff) << 16) |
    ((h[offset + 2]! & 0xff) << 8) |
    (h[offset + 3]! & 0xff);
  return String(bin % 10 ** digits).padStart(digits, '0');
}

export function timeStep(atMs: number, stepS = KIOSK_STEP_S): number {
  return Math.floor(atMs / 1000 / stepS);
}

/** TOTP code for a base32 secret at an instant. */
export function kioskCode(secretB32: string, atMs: number = Date.now()): string {
  return hotp(base32Decode(secretB32), timeStep(atMs));
}

/** Seconds left in the current window. */
export function secondsRemaining(atMs: number = Date.now()): number {
  return KIOSK_STEP_S - (Math.floor(atMs / 1000) % KIOSK_STEP_S);
}

/** Accept the current window or the previous one only. */
export function verifyKioskCode(secretB32: string, code: string, atMs: number = Date.now()): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  const given = Buffer.from(code);
  for (const t of [atMs, atMs - KIOSK_STEP_S * 1000]) {
    const expected = Buffer.from(kioskCode(secretB32, t));
    if (timingSafeEqual(given, expected)) return true;
  }
  return false;
}
