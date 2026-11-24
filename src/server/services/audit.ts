import 'server-only';
import type { Prisma } from '@prisma/client';
import type { Tx } from '../db';
import type { CurrentUser } from '../rbac';

/** Every write that changes HR data also writes an AuditLog row in the same transaction (CLAUDE.md rule 2). */
export async function writeAudit(
  tx: Tx,
  actor: Pick<CurrentUser, 'id' | 'activeRole'> | null,
  action: string,
  entity: string,
  entityId: string | null,
  detail?: Record<string, unknown>,
): Promise<void> {
  await tx.auditLog.create({
    data: {
      actorId: actor?.id ?? null,
      role: actor?.activeRole ?? 'system',
      action,
      entity,
      entityId,
      detail: detail
        ? (JSON.parse(JSON.stringify(detail, bigintReplacer)) as Prisma.InputJsonValue)
        : undefined,
    },
  });
}

function bigintReplacer(_k: string, v: unknown) {
  return typeof v === 'bigint' ? Number(v) : v;
}

/** Fields that differ between two snapshots, as { field: { before, after } }. */
export function diff(before: Record<string, unknown>, after: Record<string, unknown>) {
  const out: Record<string, { before: unknown; after: unknown }> = {};
  for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const a = norm(before[k]);
    const b = norm(after[k]);
    if (JSON.stringify(a) !== JSON.stringify(b)) out[k] = { before: a, after: b };
  }
  return out;
}

function norm(v: unknown): unknown {
  if (typeof v === 'bigint') return Number(v);
  if (v instanceof Date) return v.toISOString();
  return v;
}
