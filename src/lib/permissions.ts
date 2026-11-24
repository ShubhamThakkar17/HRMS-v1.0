// The 20 permission keys and 7 default roles from the prototype. Shared by client and server.

export const PERMISSIONS = [
  { key: 'team.view', group: 'Team', label: 'See own team and its attendance' },
  { key: 'approve.team', group: 'Team', label: 'Approve own team’s requests' },
  { key: 'emp.view', group: 'People', label: 'View all employee records' },
  { key: 'emp.edit', group: 'People', label: 'Add and edit employees' },
  { key: 'emp.roles', group: 'People', label: 'Assign roles to people' },
  { key: 'att.all', group: 'Attendance', label: 'View everyone’s attendance' },
  { key: 'att.correct', group: 'Attendance', label: 'Correct attendance records' },
  { key: 'leave.all', group: 'Leave', label: 'View all leave requests' },
  { key: 'leave.approve_all', group: 'Leave', label: 'Approve any leave, correction or claim' },
  { key: 'leave.policy', group: 'Leave', label: 'Edit leave types and entitlements' },
  { key: 'holidays.manage', group: 'Company', label: 'Manage the holiday calendar' },
  { key: 'announce.post', group: 'Company', label: 'Post announcements' },
  { key: 'expense.pay', group: 'Finance', label: 'Reimburse approved expense claims' },
  { key: 'payroll.view', group: 'Finance', label: 'View the payroll preview' },
  { key: 'dash.exec', group: 'Leadership', label: 'Executive dashboard' },
  { key: 'reports.view', group: 'Leadership', label: 'View reports' },
  { key: 'audit.view', group: 'Admin', label: 'View the audit log' },
  { key: 'sheets.sync', group: 'Admin', label: 'Sync data to Google Sheets' },
  { key: 'settings.manage', group: 'Admin', label: 'Manage offices, shifts, punch rules and kiosk' },
  { key: 'roles.manage', group: 'Admin', label: 'Edit roles and permissions' },
] as const;

export type Permission = (typeof PERMISSIONS)[number]['key'];
export const ALL_PERMISSIONS: Permission[] = PERMISSIONS.map((p) => p.key);

export function isPermission(s: string): s is Permission {
  return (ALL_PERMISSIONS as string[]).includes(s);
}

export const SUPER_ADMIN = 'Super Admin';
export const ROLE_ORDER = [
  'Super Admin',
  'Director',
  'HR Admin',
  'HR Executive',
  'Finance',
  'Manager',
  'Employee',
];

export const DEFAULT_ROLES: Record<string, Permission[]> = {
  'Super Admin': ALL_PERMISSIONS,
  Director: [
    'team.view',
    'approve.team',
    'emp.view',
    'att.all',
    'leave.all',
    'payroll.view',
    'dash.exec',
    'reports.view',
    'audit.view',
  ],
  'HR Admin': [
    'team.view',
    'approve.team',
    'emp.view',
    'emp.edit',
    'emp.roles',
    'att.all',
    'att.correct',
    'leave.all',
    'leave.approve_all',
    'leave.policy',
    'holidays.manage',
    'announce.post',
    'reports.view',
    'audit.view',
    'sheets.sync',
  ],
  'HR Executive': [
    'emp.view',
    'emp.edit',
    'att.all',
    'att.correct',
    'leave.all',
    'holidays.manage',
    'announce.post',
  ],
  Finance: ['expense.pay', 'payroll.view', 'reports.view', 'emp.view'],
  Manager: ['team.view', 'approve.team'],
  Employee: [],
};

/** Permissions for an active role. Super Admin always has every permission. */
export function permissionsForRole(roleName: string, rolePermissions: string[]): Set<Permission> {
  if (roleName === SUPER_ADMIN) return new Set(ALL_PERMISSIONS);
  return new Set(rolePermissions.filter(isPermission));
}

/** The highest role by the default order, used when no active role is chosen. */
export function bestRole(roleNames: string[]): string {
  const sorted = [...roleNames].sort((a, b) => rank(a) - rank(b));
  return sorted[0] ?? 'Employee';
}

function rank(r: string): number {
  const i = ROLE_ORDER.indexOf(r);
  return i === -1 ? ROLE_ORDER.length : i;
}

export function sortRoles<T extends { name: string }>(roles: T[]): T[] {
  return [...roles].sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name));
}

// ---- Navigation (grouped as in the prototype) ----
export type NavCheck = Permission | 'approvals';
export interface NavItem {
  href: string;
  label: string;
  perm?: NavCheck;
}
export const NAV: { group: string; items: NavItem[] }[] = [
  {
    group: 'My work',
    items: [
      { href: '/', label: 'Home' },
      { href: '/punch', label: 'Punch in and out' },
      { href: '/approvals', label: 'Approvals', perm: 'approvals' },
      { href: '/my/attendance', label: 'My attendance' },
      { href: '/my/leave', label: 'My leave' },
      { href: '/my/expenses', label: 'My expenses' },
      { href: '/my/payslip', label: 'My payslip' },
      { href: '/profile', label: 'My profile' },
    ],
  },
  {
    group: 'Company',
    items: [
      { href: '/directory', label: 'Directory' },
      { href: '/org-chart', label: 'Org chart' },
      { href: '/holidays', label: 'Holidays' },
      { href: '/announcements', label: 'Announcements' },
    ],
  },
  {
    group: 'Team',
    items: [
      { href: '/team', label: 'Team overview', perm: 'team.view' },
      { href: '/team/attendance', label: 'Team attendance', perm: 'team.view' },
    ],
  },
  {
    group: 'HR',
    items: [
      { href: '/hr/employees', label: 'Employee records', perm: 'emp.view' },
      { href: '/hr/attendance', label: 'Attendance', perm: 'att.all' },
      { href: '/hr/leave', label: 'Leave', perm: 'leave.all' },
    ],
  },
  {
    group: 'Finance',
    items: [
      { href: '/finance/expenses', label: 'Expense claims', perm: 'expense.pay' },
      { href: '/finance/payroll', label: 'Payroll preview', perm: 'payroll.view' },
    ],
  },
  {
    group: 'Leadership',
    items: [
      { href: '/leadership/dashboard', label: 'Executive dashboard', perm: 'dash.exec' },
      { href: '/leadership/reports', label: 'Reports', perm: 'reports.view' },
    ],
  },
  {
    group: 'Admin',
    items: [
      { href: '/admin/roles', label: 'Roles and permissions', perm: 'roles.manage' },
      { href: '/admin/settings', label: 'Settings', perm: 'settings.manage' },
      { href: '/admin/kiosk', label: 'Office kiosk', perm: 'settings.manage' },
      { href: '/admin/import', label: 'Import employees', perm: 'emp.edit' },
      { href: '/admin/sync', label: 'Google Sheets sync', perm: 'sheets.sync' },
      { href: '/admin/audit', label: 'Audit log', perm: 'audit.view' },
    ],
  },
];

export function canSeeApprovals(perms: Set<Permission>): boolean {
  return perms.has('approve.team') || perms.has('leave.approve_all') || perms.has('expense.pay');
}

export function navFor(perms: Set<Permission>): { group: string; items: NavItem[] }[] {
  return NAV.map((g) => ({
    group: g.group,
    items: g.items.filter((it) => {
      if (!it.perm) return true;
      if (it.perm === 'approvals') return canSeeApprovals(perms);
      return perms.has(it.perm);
    }),
  })).filter((g) => g.items.length > 0);
}
