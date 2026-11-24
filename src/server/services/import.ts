import 'server-only';
import { db } from '../db';
import { writeAudit } from './audit';
import { nextCode } from './codes';
import { ensureBalances } from './leave';
import { requirePermission, type CurrentUser } from '../rbac';
import { UserError } from '../errors';
import { parseCsv } from '@/lib/csv';
import { isISODate, toDbDate } from '@/lib/dates';

export const IMPORT_COLUMNS = [
  'name',
  'email',
  'phone',
  'dept',
  'title',
  'manager_email',
  'joined_on',
  'work_mode',
  'office_code',
  'annual_ctc_inr',
  'roles',
];
export const IMPORT_TEMPLATE =
  IMPORT_COLUMNS.join(',') +
  '\r\nAsha Verma,asha.verma@example.com,9800000000,Technology,Developer,aditya@demo.example,2026-12-01,OFFICE,HO,720000,Employee\r\n';

export interface ImportRow {
  line: number;
  name: string;
  email: string;
  phone: string | null;
  dept: string;
  title: string;
  managerEmail: string | null;
  joinedOn: string;
  workMode: 'OFFICE' | 'HYBRID' | 'REMOTE';
  officeCode: string | null;
  ctcPaise: number;
  roles: string[];
  errors: string[];
}

/** Validate a CSV and report every error before anything is imported. */
export async function validateImport(user: CurrentUser, csv: string): Promise<ImportRow[]> {
  requirePermission(user, 'emp.edit');
  const rows = parseCsv(csv);
  if (!rows.length) throw new UserError('The file is empty.');
  const header = rows[0]!.map((h) => h.trim().toLowerCase());
  const missing = IMPORT_COLUMNS.filter((c) => !header.includes(c));
  if (missing.length) throw new UserError(`Missing columns: ${missing.join(', ')}`);
  if (rows.length > 1001) throw new UserError('Import at most 1000 people at a time.');
  const [existing, offices, roles] = await Promise.all([
    db.employee.findMany({ select: { email: true } }),
    db.office.findMany({ select: { code: true } }),
    db.role.findMany({ select: { name: true } }),
  ]);
  const existingEmails = new Set(existing.map((e) => e.email));
  const officeCodes = new Set(offices.map((o) => o.code));
  const roleNames = new Set(roles.map((r) => r.name));
  const fileEmails = new Map<string, number>();
  const col = (r: string[], c: string) => (r[header.indexOf(c)] ?? '').trim();

  const out: ImportRow[] = rows.slice(1).map((r, i) => {
    const errors: string[] = [];
    const email = col(r, 'email').toLowerCase();
    const mode = col(r, 'work_mode').toUpperCase() || 'OFFICE';
    const ctc = Number(col(r, 'annual_ctc_inr').replace(/,/g, '') || '0');
    const office = col(r, 'office_code');
    const roleList = col(r, 'roles')
      .split(/[;|]/)
      .map((s) => s.trim())
      .filter(Boolean);
    const joined = col(r, 'joined_on');
    if (col(r, 'name').length < 2) errors.push('Name is required');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) errors.push('Email is not valid');
    else if (existingEmails.has(email)) errors.push('Email already exists');
    else if (fileEmails.has(email)) errors.push(`Email repeats line ${fileEmails.get(email)}`);
    fileEmails.set(email, i + 2);
    if (!col(r, 'dept')) errors.push('Department is required');
    if (!col(r, 'title')) errors.push('Designation is required');
    if (!isISODate(joined)) errors.push('Join date must be YYYY-MM-DD');
    if (!['OFFICE', 'HYBRID', 'REMOTE'].includes(mode))
      errors.push('Work mode must be OFFICE, HYBRID or REMOTE');
    if (office && !officeCodes.has(office)) errors.push(`Unknown office ${office}`);
    if (!Number.isFinite(ctc) || ctc < 0) errors.push('CTC must be a number');
    for (const rn of roleList) if (!roleNames.has(rn)) errors.push(`Unknown role ${rn}`);
    if (roleList.includes('Super Admin')) errors.push('Super Admin cannot be granted by import');
    return {
      line: i + 2,
      name: col(r, 'name'),
      email,
      phone: col(r, 'phone') || null,
      dept: col(r, 'dept'),
      title: col(r, 'title'),
      managerEmail: col(r, 'manager_email').toLowerCase() || null,
      joinedOn: joined,
      workMode: mode as ImportRow['workMode'],
      officeCode: office || null,
      ctcPaise: Math.round(ctc * 100),
      roles: roleList.length ? roleList : ['Employee'],
      errors,
    };
  });
  const knownEmails = new Set([...existingEmails, ...out.map((r) => r.email)]);
  for (const r of out)
    if (r.managerEmail && !knownEmails.has(r.managerEmail))
      r.errors.push(`Unknown manager ${r.managerEmail}`);
  return out;
}

export async function runImport(user: CurrentUser, csv: string) {
  requirePermission(user, 'emp.edit');
  const rows = await validateImport(user, csv);
  if (rows.some((r) => r.errors.length)) throw new UserError('Fix the errors in the file before importing.');
  if (rows.some((r) => r.roles.some((x) => x !== 'Employee'))) requirePermission(user, 'emp.roles');
  return db.$transaction(
    async (tx) => {
      const offices = new Map((await tx.office.findMany()).map((o) => [o.code, o.id]));
      const roles = new Map((await tx.role.findMany()).map((r) => [r.name, r.id]));
      const created = new Map<string, string>();
      for (const r of rows) {
        const code = await nextCode(tx, 'employee');
        const e = await tx.employee.create({
          data: {
            code,
            name: r.name,
            email: r.email,
            phone: r.phone,
            dept: r.dept,
            title: r.title,
            joinedOn: toDbDate(r.joinedOn),
            workMode: r.workMode,
            officeId: r.officeCode ? offices.get(r.officeCode) : null,
            ctcPaise: BigInt(r.ctcPaise),
            roles: { create: [...new Set([...r.roles, 'Employee'])].map((n) => ({ roleId: roles.get(n)! })) },
          },
        });
        created.set(r.email, e.id);
        await ensureBalances(tx, e.id, new Date().getFullYear());
      }
      for (const r of rows) {
        if (!r.managerEmail) continue;
        const mgr =
          created.get(r.managerEmail) ??
          (await tx.employee.findUnique({ where: { email: r.managerEmail } }))?.id;
        if (mgr) await tx.employee.update({ where: { id: created.get(r.email)! }, data: { managerId: mgr } });
      }
      await writeAudit(tx, user, 'employee.import', 'Employee', null, {
        count: rows.length,
        emails: rows.map((r) => r.email),
      });
      return { count: rows.length };
    },
    { timeout: 60_000 },
  );
}
