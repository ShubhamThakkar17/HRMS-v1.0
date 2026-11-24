import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/server/current-user';
import { db } from '@/server/db';
import { fmtDate, fromDbDate } from '@/lib/dates';
import { formatINR } from '@/lib/money';
import { Card, PageHead, Stack, StatusPill, Table } from '@/components/ui';

export const metadata = { title: 'Employee records' };

export default async function Employees({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; dept?: string; status?: string; role?: string }>;
}) {
  const user = await requireUser();
  if (!user.permissions.has('emp.view')) redirect('/');
  const sp = await searchParams;
  const status = sp.status === 'INACTIVE' ? 'INACTIVE' : sp.status === 'all' ? undefined : 'ACTIVE';
  const [all, roles] = await Promise.all([
    db.employee.findMany({
      include: { manager: true, office: true, roles: { include: { role: true } } },
      orderBy: { code: 'asc' },
    }),
    db.role.findMany({ orderBy: { sortOrder: 'asc' } }),
  ]);
  const depts = [...new Set(all.map((e) => e.dept))].sort();
  const q = (sp.q ?? '').trim().toLowerCase();
  const list = all.filter(
    (e) =>
      (!status || e.status === status) &&
      (!sp.dept || e.dept === sp.dept) &&
      (!sp.role || e.roles.some((r) => r.role.name === sp.role)) &&
      (!q || `${e.code} ${e.name} ${e.email} ${e.title}`.toLowerCase().includes(q)),
  );
  const showPay = user.permissions.has('payroll.view') || user.permissions.has('emp.edit');
  return (
    <Stack>
      <PageHead
        title="Employee records"
        lead={`${all.filter((e) => e.status === 'ACTIVE').length} active, ${all.filter((e) => e.status === 'INACTIVE').length} inactive.`}
        actions={
          user.permissions.has('emp.edit') ? (
            <>
              <Link className="btn" href="/hr/employees/new">
                Add employee
              </Link>
              <Link className="btn btn-ghost" href="/admin/import">
                Import CSV
              </Link>
            </>
          ) : null
        }
      />
      <form className="flex flex-wrap items-end gap-3">
        <label className="field min-w-52 flex-1">
          Search
          <input name="q" defaultValue={sp.q} placeholder="ID, name, email or designation" />
        </label>
        <label className="field">
          Department
          <select name="dept" defaultValue={sp.dept ?? ''}>
            <option value="">All</option>
            {depts.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        </label>
        <label className="field">
          Role
          <select name="role" defaultValue={sp.role ?? ''}>
            <option value="">All</option>
            {roles.map((r) => (
              <option key={r.id}>{r.name}</option>
            ))}
          </select>
        </label>
        <label className="field">
          Status
          <select name="status" defaultValue={sp.status ?? 'ACTIVE'}>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
            <option value="all">All</option>
          </select>
        </label>
        <button className="btn" type="submit">
          Filter
        </button>
      </form>
      <Card>
        <Table
          rows={list.length}
          head={[
            'ID',
            'Name',
            'Department',
            'Manager',
            'Joined',
            'Mode',
            'Roles',
            ...(showPay ? ['#Annual CTC'] : []),
            'Status',
          ]}
          empty="No one matches."
        >
          {list.map((e) => (
            <tr key={e.id}>
              <td className="font-mono text-[13px]">{e.code}</td>
              <td>
                <Link href={`/hr/employees/${e.id}`}>{e.name}</Link>
                <div className="text-[13px] text-muted">{e.title}</div>
              </td>
              <td>{e.dept}</td>
              <td>{e.manager?.name ?? '—'}</td>
              <td className="whitespace-nowrap">{fmtDate(fromDbDate(e.joinedOn))}</td>
              <td>{e.workMode.charAt(0) + e.workMode.slice(1).toLowerCase()}</td>
              <td>
                {e.roles.map((r) => (
                  <span key={r.roleId} className="m-0.5 inline-block rounded-md bg-soft px-1.5 text-xs">
                    {r.role.name}
                  </span>
                ))}
              </td>
              {showPay ? <td className="num">{formatINR(e.ctcPaise)}</td> : null}
              <td>
                <StatusPill status={e.status} />
              </td>
            </tr>
          ))}
        </Table>
      </Card>
    </Stack>
  );
}
