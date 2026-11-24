import { redirect } from 'next/navigation';
import { requireUser } from '@/server/current-user';
import { db } from '@/server/db';
import { createEmployeeAction } from '@/server/actions/employees';
import { EmployeeForm } from '@/components/employee-form';
import { Card, PageHead, Stack } from '@/components/ui';

export const metadata = { title: 'Add employee' };

export default async function NewEmployee() {
  const user = await requireUser();
  if (!user.permissions.has('emp.edit')) redirect('/hr/employees');
  const [managers, offices, depts, roles] = await Promise.all([
    db.employee.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, code: true },
    }),
    db.office.findMany({ orderBy: { code: 'asc' } }),
    db.employee.findMany({ distinct: ['dept'], select: { dept: true } }),
    user.permissions.has('emp.roles')
      ? db.role.findMany({ orderBy: { sortOrder: 'asc' } })
      : Promise.resolve([]),
  ]);
  return (
    <Stack>
      <PageHead
        title="Add employee"
        lead="The next employee ID is given automatically. They can sign in with this email."
      />
      <Card>
        <EmployeeForm
          action={createEmployeeAction}
          managers={managers}
          offices={offices}
          depts={depts.map((d) => d.dept)}
          roles={roles.filter((r) => user.activeRole === 'Super Admin' || r.name !== 'Super Admin')}
          submit="Add employee"
        />
      </Card>
    </Stack>
  );
}
