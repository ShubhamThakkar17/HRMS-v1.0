// Money is stored as integer paise (CLAUDE.md rule 4).

export function formatINR(
  paise: number | bigint | null | undefined,
  opts: { decimals?: boolean } = {},
): string {
  const p = Number(paise ?? 0);
  const rupees = p / 100;
  const decimals = opts.decimals ?? !Number.isInteger(rupees);
  return (
    '₹' +
    rupees.toLocaleString('en-IN', {
      minimumFractionDigits: decimals ? 2 : 0,
      maximumFractionDigits: decimals ? 2 : 0,
    })
  );
}

/** "1,234.50" or "1234.5" (rupees) → 123450 paise. Returns null for invalid input. */
export function parseRupeesToPaise(input: string): number | null {
  const s = input.replace(/[₹,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [whole, frac = ''] = s.split('.');
  return Number(whole) * 100 + Number(frac.padEnd(2, '0'));
}

export function paiseToRupeesString(paise: number | bigint): string {
  return (Number(paise) / 100).toFixed(2);
}
