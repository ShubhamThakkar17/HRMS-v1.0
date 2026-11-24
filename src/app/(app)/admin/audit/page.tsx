import { redirect } from 'next/navigation';
import type { Prisma } from '@prisma/client';
import { requireUser } from '@/server/current-user';
import { db } from '@/server/db';
import { businessDate, fmtDateTime, isISODate, istInstant, addDays } from '@/lib/dates';
import { AuditDetail } from '@/components/audit-detail';
import { Card, PageHead, Stack, Table } from '@/components/ui';

export const metadata = { title: 'Audit log' };

export default async function Audit({
  searchParams,
}: {
  searchParams: Promise<{ who?: string; action?: string; from?: string; to?: string; page?: string }>;
}) {
  const user = await requireUser();
  if (!user.permissions.has('audit.view')) redirect('/');
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const where: Prisma.AuditLogWhereInput = {
    ...(sp.who ? (sp.who === 'system' ? { actorId: null } : { actorId: sp.who }) : {}),
    ...(sp.action ? { action: { startsWith: sp.action } } : {}),
    ...(sp.from && isISODate(sp.from) ? { at: { gte: istInstant(sp.from, '00:00') } } : {}),
  };
  if (sp.to && isISODate(sp.to))
    where.at = { ...(where.at as object), lt: istInstant(addDays(sp.to, 1), '00:00') };
  const [rows, total, people, actions] = await Promise.all([
    db.auditLog.findMany({
      where,
      include: { actor: true },
      orderBy: { at: 'desc' },
      take: 100,
      skip: (page - 1) * 100,
    }),
    db.auditLog.count({ where }),
    db.employee.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    db.auditLog.findMany({ distinct: ['action'], select: { action: true }, orderBy: { action: 'asc' } }),
  ]);
  const prefixes = [...new Set(actions.map((a) => a.action.split('.')[0]!))];
  const qs = (p: number) => `?${new URLSearchParams({ ...(sp as Record<string, string>), page: String(p) })}`;
  return (
    <Stack>
      <PageHead
        title="Audit log"
        lead={`${total} entries. Every change to HR data is recorded with who made it and the before and after values.`}
      />
      <form className="flex flex-wrap items-end gap-3">
        <label className="field">
          Person
          <select name="who" defaultValue={sp.who ?? ''}>
            <option value="">Anyone</option>
            <option value="system">System</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Action
          <select name="action" defaultValue={sp.action ?? ''}>
            <option value="">All</option>
            {prefixes.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          From
          <input type="date" name="from" defaultValue={sp.from} max={businessDate()} />
        </label>
        <label className="field">
          To
          <input type="date" name="to" defaultValue={sp.to} max={businessDate()} />
        </label>
        <button className="btn" type="submit">
          Filter
        </button>
      </form>
      <Card>
        <Table
          rows={rows.length}
          head={['When', 'Who', 'Action', 'Record', 'Details']}
          empty="No entries match."
        >
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="whitespace-nowrap">{fmtDateTime(r.at)}</td>
              <td>
                {r.actor?.name ?? 'System'}
                <div className="text-[13px] text-muted">{r.role}</div>
              </td>
              <td className="font-mono text-[13px]">{r.action}</td>
              <td className="text-[13px]">{r.entity}</td>
              <td className="max-w-[520px]">
                <AuditDetail detail={r.detail} />
              </td>
            </tr>
          ))}
        </Table>
        <div className="mt-3 flex gap-2">
          {page > 1 ? (
            <a className="btn btn-sm btn-ghost" href={qs(page - 1)}>
              Newer
            </a>
          ) : null}
          {page * 100 < total ? (
            <a className="btn btn-sm btn-ghost" href={qs(page + 1)}>
              Older
            </a>
          ) : null}
        </div>
      </Card>
    </Stack>
  );
}
