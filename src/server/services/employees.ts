import 'server-only';
import { z } from 'zod';
import { db, type Tx } from '../db';
import { diff, writeAudit } from './audit';
import { nextCode } from './codes';
import { ensureBalances } from './leave';
import { requirePermission, type CurrentUser } from '../rbac';
import { NotFoundError, UserError } from '../errors';
import { fromDbDate, isISODate, toDbDate } from '@/lib/dates';
import { SUPER_ADMIN } from '@/lib/permissions';

export const EmployeeInput = z.object({
  name: z.string().trim().min(2, 'Enter the full name').max(100),
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
  phone: z
    .string()
    .trim()
    .max(20)
    .optional()
    .or(z.literal(''))
    .transform((v) => v || null),
  dept: z.string().trim().min(1, 'Enter a department').max(60),
  title: z.string().trim().min(1, 'Enter a designation').max(80),
  managerId: z
    .string()
    .optional()
    .or(z.literal(''))
    .transform((v) => v || null),
  joinedOn: z.string().refine(isISODate, 'Enter a valid date'),
  workMode: z.enum(['OFFICE', 'HYBRID', 'REMOTE']),
  officeId: z
    .string()
    .optional()
    .or(z.literal(''))
    .transform((v) => v || null),
  ctcRupees: z.coerce.number().min(0).max(100_000_000),
});
export type EmployeeInput = z.infer<typeof EmployeeInput>;

function snapshot(e: {
  name: string;
  email: string;
  phone: string | null;
  dept: string;
  title: string;
  managerId: string | null;
  joinedOn: Date;
  workMode: string;
  officeId: string | null;
  ctcPaise: bigint;
  status: string;
}) {
  return {
    name: e.name,
    email: e.email,
    phone: e.phone,
    dept: e.dept,
    title: e.title,
    managerId: e.managerId,
    joinedOn: fromDbDate(e.joinedOn),
    workMode: e.workMode,
    officeId: e.officeId,
    ctcPaise: Number(e.ctcPaise),
    status: e.status,
  };
}

async function assertNoManagerCycle(tx: Tx, employeeId: string | null, managerId: string | null) {
  if (!managerId) return;
  if (managerId === employeeId) throw new UserError('A person cannot be their own manager.');
  let cur: string | null = managerId;
  for (let i = 0; cur && i < 50; i++) {
    if (cur === employeeId) throw new UserError('That manager would create a loop in the org chart.');
    const m: { managerId: string | null } | null = await tx.employee.findUnique({
      where: { id: cur },
      select: { managerId: true },
    });
    cur = m?.managerId ?? null;
  }
}

export async function createEmployee(user: CurrentUser, input: EmployeeInput, roleIds: string[] = []) {
  requirePermission(user, 'emp.edit');
  if (roleIds.length) requirePermission(user, 'emp.roles');
  return db.$transaction(async (tx) => {
    if (await tx.employee.findUnique({ where: { email: input.email } })) {
      throw new UserError('Someone already uses that email.');
    }
    await assertNoManagerCycle(tx, null, input.managerId);
    const code = await nextCode(tx, 'employee');
    const employeeRole = await tx.role.findUnique({ where: { name: 'Employee' } });
    const ids = new Set(roleIds);
    if (employeeRole) ids.add(employeeRole.id);
    const e = await tx.employee.create({
      data: {
        code,
        name: input.name,
        email: input.email,
        phone: input.phone,
        dept: input.dept,
        title: input.title,
        managerId: input.managerId,
        joinedOn: toDbDate(input.joinedOn),
        workMode: input.workMode,
        officeId: input.officeId,
        ctcPaise: BigInt(Math.round(input.ctcRupees * 100)),
        roles: { create: [...ids].map((roleId) => ({ roleId })) },
      },
    });
    await ensureBalances(tx, e.id, new Date().getFullYear());
    await writeAudit(tx, user, 'employee.create', 'Employee', e.id, { code, after: snapshot(e) });
    return e;
  });
}

export async function updateEmployee(user: CurrentUser, id: string, input: EmployeeInput) {
  requirePermission(user, 'emp.edit');
  return db.$transaction(async (tx) => {
    const before = await tx.employee.findUnique({ where: { id } });
    if (!before) throw new NotFoundError('Employee');
    const clash = await tx.employee.findUnique({ where: { email: input.email } });
    if (clash && clash.id !== id) throw new UserError('Someone else already uses that email.');
    await assertNoManagerCycle(tx, id, input.managerId);
    const e = await tx.employee.update({
      where: { id },
      data: {
        name: input.name,
        email: input.email,
        phone: input.phone,
        dept: input.dept,
        title: input.title,
        managerId: input.managerId,
        joinedOn: toDbDate(input.joinedOn),
        workMode: input.workMode,
        officeId: input.officeId,
        ctcPaise: BigInt(Math.round(input.ctcRupees * 100)),
      },
    });
    const changes = diff(snapshot(before), snapshot(e));
    if (Object.keys(changes).length)
      await writeAudit(tx, user, 'employee.update', 'Employee', id, { code: e.code, changes });
    return e;
  });
}

async function activeSuperAdmins(tx: Tx) {
  return tx.employee.count({ where: { status: 'ACTIVE', roles: { some: { role: { name: SUPER_ADMIN } } } } });
}

export async function setEmployeeStatus(user: CurrentUser, id: string, active: boolean) {
  requirePermission(user, 'emp.edit');
  if (id === user.id && !active) throw new UserError('You cannot deactivate yourself.');
  return db.$transaction(async (tx) => {
    const e = await tx.employee.findUnique({
      where: { id },
      include: { roles: { include: { role: true } } },
    });
    if (!e) throw new NotFoundError('Employee');
    if (!active && e.roles.some((r) => r.role.name === SUPER_ADMIN) && (await activeSuperAdmins(tx)) <= 1) {
      throw new UserError('This is the last active Super Admin. Give the role to someone else first.');
    }
    const updated = await tx.employee.update({
      where: { id },
      data: { status: active ? 'ACTIVE' : 'INACTIVE' },
    });
    await writeAudit(tx, user, active ? 'employee.reactivate' : 'employee.deactivate', 'Employee', id, {
      code: e.code,
      before: { status: e.status },
      after: { status: updated.status },
    });
    return updated;
  });
}

export async function setEmployeeRoles(user: CurrentUser, id: string, roleIds: string[]) {
  requirePermission(user, 'emp.roles');
  return db.$transaction(async (tx) => {
    const e = await tx.employee.findUnique({
      where: { id },
      include: { roles: { include: { role: true } } },
    });
    if (!e) throw new NotFoundError('Employee');
    const roles = await tx.role.findMany({ where: { id: { in: roleIds } } });
    if (roles.length !== new Set(roleIds).size) throw new UserError('Unknown role.');
    const beforeNames = e.roles.map((r) => r.role.name).sort();
    const afterNames = roles.map((r) => r.name).sort();
    if (!afterNames.length) throw new UserError('Everyone needs at least one role.');
    const isSuper = (n: string[]) => n.includes(SUPER_ADMIN);
    if (
      isSuper(beforeNames) &&
      !isSuper(afterNames) &&
      e.status === 'ACTIVE' &&
      (await activeSuperAdmins(tx)) <= 1
    ) {
      throw new UserError('This is the last Super Admin. Give the role to someone else first.');
    }
    if (isSuper(afterNames) && !isSuper(beforeNames) && user.activeRole !== SUPER_ADMIN) {
      throw new UserError('Only a Super Admin can grant the Super Admin role.');
    }
    await tx.employeeRole.deleteMany({ where: { employeeId: id } });
    await tx.employeeRole.createMany({ data: roles.map((r) => ({ employeeId: id, roleId: r.id })) });
    await writeAudit(tx, user, 'employee.roles', 'Employee', id, {
      code: e.code,
      before: beforeNames,
      after: afterNames,
    });
  });
}

export async function setRolePermissions(user: CurrentUser, roleId: string, permissions: string[]) {
  requirePermission(user, 'roles.manage');
  return db.$transaction(async (tx) => {
    const r = await tx.role.findUnique({ where: { id: roleId } });
    if (!r) throw new NotFoundError('Role');
    if (r.name === SUPER_ADMIN) throw new UserError('Super Admin always has every permission.');
    const updated = await tx.role.update({
      where: { id: roleId },
      data: { permissions: [...new Set(permissions)].sort() },
    });
    await writeAudit(tx, user, 'role.permissions', 'Role', roleId, {
      role: r.name,
      before: r.permissions,
      after: updated.permissions,
    });
  });
}

export async function createRole(user: CurrentUser, name: string) {
  requirePermission(user, 'roles.manage');
  return db.$transaction(async (tx) => {
    if (await tx.role.findUnique({ where: { name } })) throw new UserError('A role with that name exists.');
    const r = await tx.role.create({ data: { name, permissions: [], isSystem: false } });
    await writeAudit(tx, user, 'role.create', 'Role', r.id, { name });
    return r;
  });
}

export async function deleteRole(user: CurrentUser, roleId: string) {
  requirePermission(user, 'roles.manage');
  return db.$transaction(async (tx) => {
    const r = await tx.role.findUnique({
      where: { id: roleId },
      include: { _count: { select: { members: true } } },
    });
    if (!r) throw new NotFoundError('Role');
    if (r.isSystem) throw new UserError('Default roles cannot be deleted.');
    if (r._count.members) throw new UserError('Remove this role from everyone first.');
    await tx.role.delete({ where: { id: roleId } });
    await writeAudit(tx, user, 'role.delete', 'Role', roleId, { name: r.name });
  });
}
