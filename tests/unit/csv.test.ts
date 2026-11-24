import { describe, expect, it } from 'vitest';
import { parseCsv, toCsv } from '@/lib/csv';

describe('csv', () => {
  it('quotes and escapes fields and guards formulas', () => {
    expect(toCsv([['a,b', 'say "hi"', '=SUM(A1)', 5]])).toBe('"a,b","say ""hi""",\'=SUM(A1),5');
  });
  it('parses quoted fields, CRLF and a BOM', () => {
    expect(parseCsv('﻿name,note\r\n"Shah, Meera","line1\nline2"\r\n\r\n')).toEqual([
      ['name', 'note'],
      ['Shah, Meera', 'line1\nline2'],
    ]);
  });
});
