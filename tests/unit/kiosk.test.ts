import { describe, expect, it } from 'vitest';
import { base32Decode, base32Encode, hotp, kioskCode, secondsRemaining, verifyKioskCode } from '@/lib/kiosk';

// RFC 6238 Appendix B test secret ("12345678901234567890"), SHA-1, truncated to 6 digits.
const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890'));

describe('TOTP (RFC 6238)', () => {
  it('round-trips base32', () => {
    expect(base32Decode(RFC_SECRET).toString()).toBe('12345678901234567890');
    expect(RFC_SECRET).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
  });
  it('matches the RFC 4226 HOTP vectors', () => {
    const s = Buffer.from('12345678901234567890');
    expect(['755224', '287082', '359152', '969429', '338314'].map((_, i) => hotp(s, i))).toEqual([
      '755224',
      '287082',
      '359152',
      '969429',
      '338314',
    ]);
  });
  it('matches the RFC 6238 SHA-1 vectors (last 6 digits)', () => {
    expect(kioskCode(RFC_SECRET, 59_000)).toBe('287082');
    expect(kioskCode(RFC_SECRET, 1_111_111_109_000)).toBe('081804');
    expect(kioskCode(RFC_SECRET, 1_234_567_890_000)).toBe('005924');
    expect(kioskCode(RFC_SECRET, 2_000_000_000_000)).toBe('279037');
  });
  it('accepts the current and previous windows only', () => {
    const now = 1_800_000_015_000;
    expect(verifyKioskCode(RFC_SECRET, kioskCode(RFC_SECRET, now), now)).toBe(true);
    expect(verifyKioskCode(RFC_SECRET, kioskCode(RFC_SECRET, now - 30_000), now)).toBe(true);
    expect(verifyKioskCode(RFC_SECRET, kioskCode(RFC_SECRET, now - 60_000), now)).toBe(false);
    expect(verifyKioskCode(RFC_SECRET, kioskCode(RFC_SECRET, now + 30_000), now)).toBe(false);
  });
  it('rejects malformed codes', () => {
    expect(verifyKioskCode(RFC_SECRET, '12345', 0)).toBe(false);
    expect(verifyKioskCode(RFC_SECRET, 'abcdef', 0)).toBe(false);
  });
  it('counts down the window', () => {
    expect(secondsRemaining(1_800_000_000_000)).toBe(30);
    expect(secondsRemaining(1_800_000_029_000)).toBe(1);
  });
});
