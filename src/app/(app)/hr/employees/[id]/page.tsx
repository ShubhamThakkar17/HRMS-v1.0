import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requireUser } from '@/server/current-user';
import { db } from '@/server/db';
import { setRolesAction, setStatusAction, updateEmployeeAction } from '@/server/actions/employees';
import { balancesFor } from '@/server/services/leave';
import { fmtDate, fmtDateTime, fromDbDate } from '@/lib/dates';
import { formatINR } from '@/lib/money';
import { EmployeeForm } from '@/components/employee-form';
import { ActionButton, ActionForm, Submit } from '@/components/forms';
import { AuditDetail } from '@/components/audit-detail';
import { Card, Facts, PageHead, Stack, StatusPill, Table, Two } from '@/components/ui';

export const metadata = { title: 'Employee' };

export default async function EmployeePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user.permissions.has('emp.view')) redirect('/');
  const { id } = await params;
  const e = await db.employee.findUnique({
    where: { id },
    include: {
      manager: true,
      office: true,
      roles: { include: { role: true } },
      faceTemplate: { select: { consentAt: true } },
    },
  });
  if (!e) notFound();
  const canEdit = user.permissions.has('emp.edit');
  const canRoles = user.permissions.has('emp.roles');
  const [managers, offices, depts, roles, balances, history] = await Promise.all([
    db.employee.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, code: true },
    }),
    db.office.findMany({ orderBy: { code: 'asc' } }),
    db.employee.findMany({ distinct: ['dept'], select: { dept: true } }),
    db.role.findMany({ orderBy: { sortOrder: 'asc' } }),
    balancesFor(e.id),
    user.permissions.has('audit.view')
      ? db.auditLog.findMany({
          where: { OR: [{ entity: 'Employee', entityId: e.id }] },
          include: { actor: true },
          orderBy: { at: 'desc' },
          take: 20,
        })
      : Promise.resolve([]),
  ]);
  const held = new Set(e.roles.map((r) => r.roleId));
  return (
    <Stack>
      <PageHead
        title={e.name}
        lead={
          <>
            {e.code} · {e.title} · {e.dept} · <StatusPill status={e.status} />
          </>
        }
        actions={
          <>
            {user.permissions.has('att.all') ? (
              <Link className="btn btn-ghost" href={`/hr/attendance?employee=${e.id}`}>
                Attendance
              </Link>
            ) : null}
            {canEdit && e.id !== user.id ? (
              <ActionButton
                action={setStatusAction}
                fields={{ id: e.id, active: String(e.status !== 'ACTIVE') }}
                label={e.status === 'ACTIVE' ? 'Deactivate' : 'Reactivate'}
                className={e.status === 'ACTIVE' ? 'btn btn-danger' : 'btn'}
                confirm={
                  e.status === 'ACTIVE'
                    ? `Deactivate ${e.name}? They will not be able to sign in.`
                    : undefined
                }
              />
            ) : null}
          </>
        }
      />
      {canEdit ? (
        <Card title="Edit record">
          <EmployeeForm
            action={updateEmployeeAction}
            values={{ ...e, ctcPaise: Number(e.ctcPaise) }}
            managers={managers}
            offices={offices}
            depts={depts.map((d) => d.dept)}
            submit="Save changes"
          />
        </Card>
      ) : (
        <Card title="Record">
          <Facts
            items={[
              ['Email', e.email],
              ['Phone', e.phone ?? '—'],
              ['Manager', e.manager?.name ?? '—'],
              ['Joined', fmtDate(fromDbDate(e.joinedOn))],
              ['Work mode', e.workMode],
              ['Office', e.office?.name ?? '—'],
              ...(user.permissions.has('payroll.view')
                ? ([['Annual CTC', formatINR(e.ctcPaise)]] as [string, string][])
                : []),
            ]}
          />
        </Card>
      )}
      <Two>
        <Card title="Roles">
          {canRoles ? (
            <ActionForm action={setRolesAction} reset={false}>
              <input type="hidden" name="id" value={e.id} />
              <div className="flex flex-wrap gap-x-4.5 gap-y-2">
                {roles.map((r) => (
                  <label key={r.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="roleIds"
                      value={r.id}
                      defaultChecked={held.has(r.id)}
                      disabled={r.name === 'Super Admin' && user.activeRole !== 'Super Admin'}
                    />
                    {r.name}
                    {r.name === 'Super Admin' && user.activeRole !== 'Super Admin' && held.has(r.id) ? (
                      <input type="hidden" name="roleIds" value={r.id} />
                    ) : null}
                  </label>
                ))}
              </div>
              <div>
                <Submit>Save roles</Submit>
              </div>
            </ActionForm>
          ) : (
            <p>
              {e.roles.map((r) => r.role.name).join(', ')}
              <span className="mt-2 block text-[13px] text-muted">
                Changing roles needs the “Assign roles” permission.
              </span>
            </p>
          )}
        </Card>
        <Card title="Leave this year">
          <Table rows={balances.length} head={['Type', '#Entitled', '#Used', '#Pending', '#Left']}>
            {balances.map((b) => (
              <tr key={b.code}>
                <td>{b.name}</td>
                <td className="num">{b.opening + b.accrued}</td>
                <td className="num">{b.used}</td>
                <td className="num">{b.pending}</td>
                <td className="num">{b.remaining}</td>
              </tr>
            ))}
          </Table>
          <p className="mt-3 text-[13px] text-muted">
            Face ID: {e.faceTemplate ? `enrolled ${fmtDateTime(e.faceTemplate.consentAt)}` : 'not enrolled'}
          </p>
        </Card>
      </Two>
      {history.length ? (
        <Card title="Change history">
          <Table rows={history.length} head={['When', 'Who', 'Action', 'Details']}>
            {history.map((h) => (
              <tr key={h.id}>
                <td className="whitespace-nowrap">{fmtDateTime(h.at)}</td>
                <td>
                  {h.actor?.name ?? 'System'}
                  <div className="text-[13px] text-muted">{h.role}</div>
                </td>
                <td className="font-mono text-[13px]">{h.action}</td>
                <td>
                  <AuditDetail detail={h.detail} />
                </td>
              </tr>
            ))}
          </Table>
        </Card>
      ) : null}
    </Stack>
  );
}
