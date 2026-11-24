import { describe, expect, it } from 'vitest';
import { formatINR, parseRupeesToPaise } from '@/lib/money';

describe('money', () => {
  it('formats paise as Indian rupees with lakh grouping', () => {
    expect(formatINR(360000000)).toBe('₹36,00,000');
    expect(formatINR(185050)).toBe('₹1,850.50');
    expect(formatINR(0n)).toBe('₹0');
  });
  it('parses rupee input to integer paise', () => {
    expect(parseRupeesToPaise('1,850.5')).toBe(185050);
    expect(parseRupeesToPaise('₹799')).toBe(79900);
    expect(parseRupeesToPaise('12.345')).toBeNull();
    expect(parseRupeesToPaise('-5')).toBeNull();
  });
});
