import { describe, expect, it } from 'vitest';
import { canDecide, getPermissions, requirePermission } from '@/server/rbac';
import { ForbiddenError, UnauthorizedError } from '@/server/errors';
import { ALL_PERMISSIONS, DEFAULT_ROLES, navFor, permissionsForRole } from '@/lib/permissions';

const role = (name: string) => ({ role: { name, permissions: DEFAULT_ROLES[name] ?? [] } });

describe('getPermissions', () => {
  it('uses the highest role when no active role is chosen', () => {
    const r = getPermissions({ id: 'x', roles: [role('Employee'), role('HR Admin')] });
    expect(r.activeRole).toBe('HR Admin');
    expect(r.permissions.has('emp.roles')).toBe(true);
  });
  it('switches to a chosen active role the person holds', () => {
    const e = { id: 'x', roles: [role('Employee'), role('Manager')] };
    expect(getPermissions(e, 'Employee').permissions.size).toBe(0);
    expect(getPermissions(e, 'Manager').permissions.has('approve.team')).toBe(true);
  });
  it('ignores an active role the person does not hold', () => {
    const r = getPermissions({ id: 'x', roles: [role('Employee')] }, 'Super Admin');
    expect(r.activeRole).toBe('Employee');
    expect(r.permissions.size).toBe(0);
  });
  it('gives Super Admin every permission whatever is stored', () => {
    expect(permissionsForRole('Super Admin', []).size).toBe(ALL_PERMISSIONS.length);
    expect(ALL_PERMISSIONS).toHaveLength(20);
  });
  it('drops unknown permission strings', () => {
    expect([...permissionsForRole('Custom', ['emp.view', 'nonsense'])]).toEqual(['emp.view']);
  });
});

describe('requirePermission', () => {
  it('throws 401 without a user and 403 without the permission', () => {
    expect(() => requirePermission(null, 'emp.view')).toThrow(UnauthorizedError);
    const hrExec = getPermissions({ id: 'x', roles: [role('HR Executive')] });
    expect(() => requirePermission(hrExec, 'emp.roles')).toThrow(ForbiddenError);
    expect(() => requirePermission(hrExec, 'emp.edit')).not.toThrow();
  });
});

describe('canDecide', () => {
  const mgr = { id: 'm', ...getPermissions({ id: 'm', roles: [role('Manager')] }) };
  const hr = { id: 'h', ...getPermissions({ id: 'h', roles: [role('HR Admin')] }) };
  it('lets a manager decide for direct reports only', () => {
    expect(canDecide(mgr, { id: 'r', managerId: 'm' })).toBe(true);
    expect(canDecide(mgr, { id: 'r', managerId: 'other' })).toBe(false);
  });
  it('lets leave.approve_all decide for anyone except themselves', () => {
    expect(canDecide(hr, { id: 'r', managerId: 'other' })).toBe(true);
    expect(canDecide(hr, { id: 'h', managerId: null })).toBe(false);
  });
});

describe('navigation per role', () => {
  const labels = (r: string) =>
    navFor(permissionsForRole(r, DEFAULT_ROLES[r] ?? [])).flatMap((g) => g.items.map((i) => i.label));
  it('shows an employee only self-service and company items', () => {
    const groups = navFor(new Set()).map((g) => g.group);
    expect(groups).toEqual(['My work', 'Company']);
    expect(labels('Employee')).not.toContain('Approvals');
  });
  it('shows Finance the finance screens and approvals', () => {
    expect(labels('Finance')).toEqual(
      expect.arrayContaining([
        'Approvals',
        'Expense claims',
        'Payroll preview',
        'Reports',
        'Employee records',
      ]),
    );
    expect(labels('Finance')).not.toContain('Executive dashboard');
  });
  it('shows Super Admin every screen', () => {
    expect(labels('Super Admin')).toEqual(
      expect.arrayContaining(['Roles and permissions', 'Office kiosk', 'Audit log', 'Executive dashboard']),
    );
  });
});
