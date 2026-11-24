import 'server-only';
import type { Tx } from '../db';

/** Next human-readable code like LR-008. Uses the max existing numeric suffix. */
export async function nextCode(tx: Tx, kind: 'leave' | 'reg' | 'expense' | 'employee'): Promise<string> {
  const cfg = {
    leave: { prefix: 'LR-', width: 3, list: () => tx.leaveRequest.findMany({ select: { code: true } }) },
    reg: { prefix: 'RG-', width: 3, list: () => tx.regularisation.findMany({ select: { code: true } }) },
    expense: { prefix: 'EX-', width: 3, list: () => tx.expenseClaim.findMany({ select: { code: true } }) },
    employee: { prefix: 'E', width: 3, list: () => tx.employee.findMany({ select: { code: true } }) },
  }[kind];
  const rows = await cfg.list();
  let max = 0;
  for (const r of rows) {
    if (!r.code.startsWith(cfg.prefix)) continue;
    const n = Number(r.code.slice(cfg.prefix.length));
    if (Number.isFinite(n) && n > max) max = n;
  }
  return cfg.prefix + String(max + 1).padStart(cfg.width, '0');
}
