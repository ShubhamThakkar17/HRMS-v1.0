import { PrismaClient } from '@prisma/client';
import { getPermissions, type CurrentUser } from '@/server/rbac';
import { DEFAULT_ROLES, ROLE_ORDER } from '@/lib/permissions';
import { toDbDate } from '@/lib/dates';

export const db = new PrismaClient();

const TABLES = [
  'AuditLog',
  'RateEvent',
  'VerificationCode',
  'Punch',
  'AttendanceDay',
  'LeaveBalance',
  'LeaveRequest',
  'Regularisation',
  'ExpenseClaim',
  'Announcement',
  'FaceTemplate',
  'ConsentRecord',
  'KioskDevice',
  'EmployeeRole',
  'Employee',
  'Role',
  'Holiday',
  'Office',
  'Shift',
  'LeaveType',
  'Setting',
];

export async function resetDb() {
  await db.$executeRawUnsafe(`TRUNCATE ${TABLES.map((t) => `"${t}"`).join(', ')} CASCADE`);
}

/** A tiny company: director (D), manager (M) with two reports (A, B), HR admin (H), super admin (S), finance (F). */
export async function seedCompany() {
  await resetDb();
  const roles: Record<string, string> = {};
  for (const [i, name] of ROLE_ORDER.entries()) {
    roles[name] = (
      await db.role.create({
        data: { name, permissions: DEFAULT_ROLES[name] ?? [], isSystem: true, sortOrder: i },
      })
    ).id;
  }
  const office = await db.office.create({
    data: { code: 'HO', name: 'Head office', lat: 23.0225, lng: 72.5714, radiusM: 200 },
  });
  await db.shift.create({
    data: { start: '09:30', end: '18:30', lateAfter: '09:40', shortDayHours: 4.5, isDefault: true },
  });
  await db.leaveType.createMany({
    data: [
      { code: 'CL', name: 'Casual leave', annualDays: 12, carryForward: 0 },
      { code: 'EL', name: 'Earned leave', annualDays: 15, carryForward: 5 },
    ],
  });
  const mk = async (
    code: string,
    name: string,
    roleNames: string[],
    managerId: string | null = null,
    mode: 'OFFICE' | 'HYBRID' | 'REMOTE' = 'OFFICE',
  ) =>
    db.employee.create({
      data: {
        code,
        name,
        email: `${code.toLowerCase()}@test.example`,
        dept: 'Ops',
        title: 'Staff',
        managerId,
        joinedOn: toDbDate('2024-01-01'),
        workMode: mode,
        officeId: office.id,
        ctcPaise: 1_200_000_00n,
        roles: { create: [...new Set([...roleNames, 'Employee'])].map((n) => ({ roleId: roles[n]! })) },
      },
    });
  const D = await mk('D01', 'Director', ['Director']);
  const S = await mk('S01', 'Super', ['Super Admin'], D.id);
  const H = await mk('H01', 'HR Admin', ['HR Admin'], D.id);
  const F = await mk('F01', 'Finance', ['Finance'], D.id);
  const M = await mk('M01', 'Manager', ['Manager'], D.id);
  const A = await mk('A01', 'Asha', [], M.id);
  const B = await mk('B01', 'Bharat', [], M.id, 'HYBRID');
  return { roles, office, D, S, H, F, M, A, B };
}

export async function asUser(employeeId: string, activeRole?: string): Promise<CurrentUser> {
  const e = await db.employee.findUniqueOrThrow({
    where: { id: employeeId },
    include: { roles: { include: { role: true } } },
  });
  const { activeRole: r, permissions } = getPermissions(e, activeRole);
  return {
    id: e.id,
    code: e.code,
    name: e.name,
    email: e.email,
    title: e.title,
    dept: e.dept,
    managerId: e.managerId,
    officeId: e.officeId,
    workMode: e.workMode,
    roleNames: e.roles.map((x) => x.role.name),
    activeRole: r,
    permissions,
  };
}
