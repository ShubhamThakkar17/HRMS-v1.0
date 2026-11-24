import { redirect } from 'next/navigation';
import { requireUser } from '@/server/current-user';
import { db } from '@/server/db';
import { createRoleAction, deleteRoleAction, setRolePermsAction } from '@/server/actions/employees';
import { PERMISSIONS, SUPER_ADMIN } from '@/lib/permissions';
import { ActionButton, ActionForm, Submit } from '@/components/forms';
import { Card, PageHead, Stack } from '@/components/ui';

export const metadata = { title: 'Roles and permissions' };

export default async function Roles() {
  const user = await requireUser();
  if (!user.permissions.has('roles.manage')) redirect('/');
  const roles = await db.role.findMany({
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    include: { members: { include: { employee: { select: { name: true, status: true } } } } },
  });
  return (
    <Stack>
      <PageHead
        title="Roles and permissions"
        lead="Tick what each role may do. Super Admin always has everything. People can hold several roles and switch between them."
      />
      {roles.map((r) => {
        const people = r.members.filter((m) => m.employee.status === 'ACTIVE').map((m) => m.employee.name);
        return (
          <Card
            key={r.id}
            title={r.name}
            extra={
              <span className="text-[13px] text-muted">{people.length ? people.join(', ') : 'No one'}</span>
            }
          >
            {r.name === SUPER_ADMIN ? (
              <p className="text-muted">All {PERMISSIONS.length} permissions, always.</p>
            ) : (
              <ActionForm action={setRolePermsAction} reset={false}>
                <input type="hidden" name="roleId" value={r.id} />
                <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-x-4 gap-y-1.5">
                  {PERMISSIONS.map((p) => (
                    <label key={p.key} className="flex items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        name="perm"
                        value={p.key}
                        defaultChecked={r.permissions.includes(p.key)}
                        className="mt-1"
                      />
                      <span>
                        {p.label}
                        <span className="block font-mono text-[11px] text-muted">
                          {p.group} · {p.key}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Submit>Save {r.name}</Submit>
                  {!r.isSystem ? (
                    <ActionButton
                      action={deleteRoleAction}
                      fields={{ roleId: r.id }}
                      label="Delete role"
                      className="btn btn-danger"
                      confirm={`Delete ${r.name}?`}
                    />
                  ) : null}
                  {r.name === 'Employee' ? (
                    <span className="text-[13px] text-muted">
                      Self-service screens (My work, Company) need no permission.
                    </span>
                  ) : null}
                </div>
              </ActionForm>
            )}
          </Card>
        );
      })}
      <Card title="Add a role">
        <ActionForm action={createRoleAction} className="flex flex-wrap items-end gap-3">
          <label className="field">
            Role name
            <input name="name" required minLength={2} maxLength={40} />
          </label>
          <Submit>Add role</Submit>
        </ActionForm>
      </Card>
    </Stack>
  );
}
