'use server';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireUserOrThrow } from '../current-user';
import { act, formObject, type ActionState } from '../action';
import { UserError } from '../errors';
import {
  EmployeeInput,
  createEmployee,
  createRole,
  deleteRole,
  setEmployeeRoles,
  setEmployeeStatus,
  setRolePermissions,
  updateEmployee,
} from '../services/employees';
import { hrCorrect } from '../services/attendance';
import { runImport, validateImport, type ImportRow } from '../services/import';
import { isHHMM, isISODate } from '@/lib/dates';
import { isPermission } from '@/lib/permissions';

export async function createEmployeeAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const r = await act(async () => {
    const user = await requireUserOrThrow();
    const input = EmployeeInput.parse(formObject(fd));
    const roleIds = fd.getAll('roleIds').map(String);
    const e = await createEmployee(user, input, user.permissions.has('emp.roles') ? roleIds : []);
    return { message: `Added ${e.name} as ${e.code}.`, data: { id: e.id } };
  });
  if (r?.ok) redirect(`/hr/employees/${(r.data as { id: string }).id}`);
  return r;
}

export async function updateEmployeeAction(_: ActionState, fd: FormData) {
  return act(async () => {
    const user = await requireUserOrThrow();
    const id = z.string().parse(fd.get('id'));
    await updateEmployee(user, id, EmployeeInput.parse(formObject(fd)));
    return 'Changes saved.';
  });
}

export async function setStatusAction(_: ActionState, fd: FormData) {
  return act(async () => {
    const user = await requireUserOrThrow();
    const active = fd.get('active') === 'true';
    await setEmployeeStatus(user, z.string().parse(fd.get('id')), active);
    return active ? 'Reactivated.' : 'Deactivated. They can no longer sign in.';
  });
}

export async function setRolesAction(_: ActionState, fd: FormData) {
  return act(async () => {
    const user = await requireUserOrThrow();
    await setEmployeeRoles(user, z.string().parse(fd.get('id')), fd.getAll('roleIds').map(String));
    return 'Roles updated.';
  });
}

export async function setRolePermsAction(_: ActionState, fd: FormData) {
  return act(async () => {
    const user = await requireUserOrThrow();
    const perms = fd.getAll('perm').map(String).filter(isPermission);
    await setRolePermissions(user, z.string().parse(fd.get('roleId')), perms);
    return 'Permissions saved.';
  });
}

export async function createRoleAction(_: ActionState, fd: FormData) {
  return act(async () => {
    const name = z.string().trim().min(2, 'Name the role.').max(40).parse(fd.get('name'));
    await createRole(await requireUserOrThrow(), name);
    return `Role ${name} added.`;
  });
}

export async function deleteRoleAction(_: ActionState, fd: FormData) {
  return act(async () => {
    await deleteRole(await requireUserOrThrow(), z.string().parse(fd.get('roleId')));
    return 'Role deleted.';
  });
}

export async function hrCorrectAction(_: ActionState, fd: FormData) {
  return act(async () => {
    const user = await requireUserOrThrow();
    const v = z
      .object({
        employeeId: z.string().min(1),
        date: z.string().refine(isISODate, 'Enter a valid date.'),
        inTime: z.string().refine(isHHMM, 'Check-in must be HH:mm.'),
        outTime: z.string().refine((s) => s === '' || isHHMM(s), 'Check-out must be HH:mm.'),
        reason: z.string().trim().min(3, 'A reason is required.').max(500),
      })
      .parse(formObject(fd));
    const day = await hrCorrect(user, { ...v, outTime: v.outTime || null });
    return `Corrected. The day is now ${day?.status.toLowerCase() ?? 'blank'}.`;
  });
}

export async function previewImportAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return act(async () => {
    const user = await requireUserOrThrow();
    const file = fd.get('file');
    const text = file instanceof File ? await file.text() : String(fd.get('csv') ?? '');
    if (text.length > 2_000_000) throw new UserError('The file is too large (2 MB at most).');
    const rows: ImportRow[] = await validateImport(user, text);
    const bad = rows.filter((r) => r.errors.length).length;
    return {
      message: bad
        ? `${bad} of ${rows.length} rows have errors. Fix them and preview again.`
        : `${rows.length} rows are ready to import.`,
      data: { rows, csv: text },
    };
  });
}

export async function runImportAction(_: ActionState, fd: FormData) {
  return act(async () => {
    const r = await runImport(await requireUserOrThrow(), String(fd.get('csv') ?? ''));
    return `Imported ${r.count} people.`;
  });
}
