import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from './auth';
import { db } from './db';
import { getPermissions, type CurrentUser } from './rbac';
import { UnauthorizedError } from './errors';

export const ROLE_COOKIE = 'hrms_role';

/** The signed-in employee with their active role and permissions, or null. Deactivated employees get null. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await auth();
  const employeeId = (session as unknown as { employeeId?: string } | null)?.employeeId;
  if (!employeeId) return null;
  const e = await db.employee.findUnique({
    where: { id: employeeId },
    include: { roles: { include: { role: true } } },
  });
  if (!e || e.status !== 'ACTIVE') return null;
  const jar = await cookies();
  const { activeRole, permissions } = getPermissions(e, jar.get(ROLE_COOKIE)?.value);
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
    roleNames: e.roles.map((r) => r.role.name),
    activeRole,
    permissions,
  };
});

/** For pages: redirect to sign-in when there is no user. */
export async function requireUser(): Promise<CurrentUser> {
  const u = await getCurrentUser();
  if (!u) redirect('/login');
  return u;
}

/** For API routes and actions: throw 401 when there is no user. */
export async function requireUserOrThrow(): Promise<CurrentUser> {
  const u = await getCurrentUser();
  if (!u) throw new UnauthorizedError();
  return u;
}
