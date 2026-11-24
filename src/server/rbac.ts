// Role-based access control (CLAUDE.md rule 1). Every server action and API route calls requirePermission().
import { ForbiddenError, UnauthorizedError } from './errors';
import { bestRole, permissionsForRole, type Permission } from '@/lib/permissions';

export interface RoleLike {
  name: string;
  permissions: string[];
}

export interface EmployeeWithRoles {
  id: string;
  roles: { role: RoleLike }[];
}

export interface CurrentUser {
  id: string;
  code: string;
  name: string;
  email: string;
  title: string;
  dept: string;
  managerId: string | null;
  officeId: string | null;
  workMode: 'OFFICE' | 'HYBRID' | 'REMOTE';
  roleNames: string[];
  activeRole: string;
  permissions: Set<Permission>;
}

/** Resolve the active role (falls back to the highest role the person holds) and its permissions. */
export function getPermissions(
  employee: EmployeeWithRoles,
  activeRole?: string | null,
): { activeRole: string; permissions: Set<Permission> } {
  const names = employee.roles.map((r) => r.role.name);
  const chosen = activeRole && names.includes(activeRole) ? activeRole : bestRole(names);
  const role = employee.roles.find((r) => r.role.name === chosen)?.role;
  return { activeRole: chosen, permissions: permissionsForRole(chosen, role?.permissions ?? []) };
}

export function can(user: Pick<CurrentUser, 'permissions'> | null | undefined, perm: Permission): boolean {
  return !!user && user.permissions.has(perm);
}

export function requirePermission<U extends Pick<CurrentUser, 'permissions'>>(
  user: U | null | undefined,
  perm: Permission,
): asserts user is U {
  if (!user) throw new UnauthorizedError();
  if (!user.permissions.has(perm)) throw new ForbiddenError(perm);
}

export function requireAnyPermission<U extends Pick<CurrentUser, 'permissions'>>(
  user: U | null | undefined,
  perms: Permission[],
): asserts user is U {
  if (!user) throw new UnauthorizedError();
  if (!perms.some((p) => user.permissions.has(p))) throw new ForbiddenError(perms.join(' or '));
}

/**
 * Can this user decide (approve/reject) a request raised by `requester`?
 * Never the requester; anyone with leave.approve_all; or the requester's manager with approve.team.
 */
export function canDecide(
  user: Pick<CurrentUser, 'id' | 'permissions'>,
  requester: { id: string; managerId: string | null },
): boolean {
  if (requester.id === user.id) return false;
  if (user.permissions.has('leave.approve_all')) return true;
  return user.permissions.has('approve.team') && requester.managerId === user.id;
}
