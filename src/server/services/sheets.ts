import 'server-only';
import { createSign } from 'node:crypto';
import { db } from '../db';
import { writeAudit } from './audit';
import { getSetting, setSetting } from '../settings';
import { requirePermission, type CurrentUser } from '../rbac';
import { UserError } from '../errors';
import { fmtDateTime, fromDbDate, istTime } from '@/lib/dates';

// Google Sheets backup through a service account (Phase 11). Face templates and secrets are never exported.

type Cell = string | number | boolean;
interface Tab {
  name: string;
  head: string[];
  rows: () => Promise<Cell[][]>;
}

const n = (v: unknown): Cell => (v == null ? '' : typeof v === 'bigint' ? Number(v) : (v as Cell));
const rupees = (p: bigint | number) => Number(p) / 100;

export const TABS: Tab[] = [
  {
    name: 'Employees',
    head: [
      'Emp ID',
      'Name',
      'Email',
      'Phone',
      'Department',
      'Designation',
      'Manager ID',
      'Manager',
      'Join date',
      'Work mode',
      'Office',
      'Roles',
      'Annual CTC (INR)',
      'Status',
    ],
    rows: async () => {
      const es = await db.employee.findMany({
        include: { manager: true, office: true, roles: { include: { role: true } } },
        orderBy: { code: 'asc' },
      });
      return es.map((e) => [
        e.code,
        e.name,
        e.email,
        n(e.phone),
        e.dept,
        e.title,
        n(e.manager?.code),
        n(e.manager?.name),
        fromDbDate(e.joinedOn),
        e.workMode,
        n(e.office?.code),
        e.roles.map((r) => r.role.name).join(', '),
        rupees(e.ctcPaise),
        e.status,
      ]);
    },
  },
  {
    name: 'Attendance',
    head: [
      'Emp ID',
      'Name',
      'Date',
      'Check-in',
      'Check-out',
      'Hours',
      'Status',
      'In method',
      'Out method',
      'Office',
      'Remote',
      'Flagged',
    ],
    rows: async () => {
      const ds = await db.attendanceDay.findMany({
        include: { employee: true },
        orderBy: [{ businessDate: 'asc' }, { employeeId: 'asc' }],
      });
      const offices = new Map((await db.office.findMany()).map((o) => [o.id, o.code]));
      return ds.map((d) => [
        d.employee.code,
        d.employee.name,
        fromDbDate(d.businessDate),
        d.firstIn ? istTime(d.firstIn) : '',
        d.lastOut ? istTime(d.lastOut) : '',
        n(d.hours),
        d.status,
        n(d.inMethod),
        n(d.outMethod),
        n(d.officeId ? offices.get(d.officeId) : ''),
        d.remote ? 'Yes' : 'No',
        d.flagged ? 'Yes' : 'No',
      ]);
    },
  },
  {
    name: 'Leave',
    head: [
      'Request ID',
      'Emp ID',
      'Name',
      'Type',
      'From',
      'To',
      'Days',
      'Reason',
      'Status',
      'Decided by',
      'Comment',
      'Applied on',
    ],
    rows: async () => {
      const ls = await db.leaveRequest.findMany({
        include: { employee: true, approver: true },
        orderBy: { from: 'asc' },
      });
      return ls.map((l) => [
        l.code,
        l.employee.code,
        l.employee.name,
        l.type,
        fromDbDate(l.from),
        fromDbDate(l.to),
        l.days,
        l.reason,
        l.status,
        n(l.approver?.name),
        n(l.comment),
        fmtDateTime(l.createdAt),
      ]);
    },
  },
  {
    name: 'LeaveBalances',
    head: ['Emp ID', 'Name', 'Leave type', 'Year', 'Opening', 'Accrued', 'Used', 'Remaining'],
    rows: async () => {
      const bs = await db.leaveBalance.findMany({
        include: { employee: true, leaveType: true },
        orderBy: [{ year: 'desc' }, { employeeId: 'asc' }],
      });
      return bs.map((b) => [
        b.employee.code,
        b.employee.name,
        b.leaveType.name,
        b.year,
        b.opening,
        b.accrued,
        b.used,
        b.opening + b.accrued - b.used,
      ]);
    },
  },
  {
    name: 'Regularisation',
    head: ['Request ID', 'Emp ID', 'Name', 'Date', 'In', 'Out', 'Reason', 'Status', 'Decided by', 'Comment'],
    rows: async () => {
      const rs = await db.regularisation.findMany({
        include: { employee: true, approver: true },
        orderBy: { date: 'asc' },
      });
      return rs.map((r) => [
        r.code,
        r.employee.code,
        r.employee.name,
        fromDbDate(r.date),
        r.inTime,
        r.outTime,
        r.reason,
        r.status,
        n(r.approver?.name),
        n(r.comment),
      ]);
    },
  },
  {
    name: 'Expenses',
    head: [
      'Claim ID',
      'Emp ID',
      'Name',
      'Date',
      'Category',
      'Amount (INR)',
      'Details',
      'Receipt',
      'Status',
      'Approved by',
      'Reimbursed by',
      'Comment',
    ],
    rows: async () => {
      const xs = await db.expenseClaim.findMany({
        include: { employee: true, approver: true, paidBy: true },
        orderBy: { date: 'asc' },
      });
      return xs.map((x) => [
        x.code,
        x.employee.code,
        x.employee.name,
        fromDbDate(x.date),
        x.category,
        rupees(x.amountPaise),
        x.note,
        x.receiptKey ? 'Yes' : 'No',
        x.status,
        n(x.approver?.name),
        n(x.paidBy?.name),
        n(x.comment),
      ]);
    },
  },
  {
    name: 'Holidays',
    head: ['Date', 'Holiday', 'Office'],
    rows: async () => {
      const hs = await db.holiday.findMany({ include: { office: true }, orderBy: { date: 'asc' } });
      return hs.map((h) => [fromDbDate(h.date), h.name, h.office?.code ?? 'All']);
    },
  },
  {
    name: 'Announcements',
    head: ['ID', 'Title', 'Message', 'Posted by', 'Date', 'Pinned'],
    rows: async () => {
      const as = await db.announcement.findMany({
        include: { author: true },
        orderBy: { publishedAt: 'desc' },
      });
      return as.map((a) => [
        a.id,
        a.title,
        a.body,
        a.author.name,
        fmtDateTime(a.publishedAt),
        a.pinned ? 'Yes' : 'No',
      ]);
    },
  },
  {
    name: 'Roles',
    head: ['Role', 'Permissions', 'People with role'],
    rows: async () => {
      const rs = await db.role.findMany({
        include: { members: { include: { employee: true } } },
        orderBy: { sortOrder: 'asc' },
      });
      return rs.map((r) => [
        r.name,
        r.name === 'Super Admin' ? '(all)' : r.permissions.join(', ') || '(self-service only)',
        r.members
          .filter((m) => m.employee.status === 'ACTIVE')
          .map((m) => m.employee.name)
          .join(', '),
      ]);
    },
  },
  {
    name: 'AuditLog',
    head: ['Time', 'Who', 'Role', 'Action', 'Entity', 'Entity ID', 'Details'],
    rows: async () => {
      const ls = await db.auditLog.findMany({
        include: { actor: true },
        orderBy: { at: 'desc' },
        take: 5000,
      });
      return ls.map((l) => [
        fmtDateTime(l.at),
        l.actor?.name ?? 'System',
        n(l.role),
        l.action,
        l.entity,
        n(l.entityId),
        l.detail ? JSON.stringify(l.detail).slice(0, 2000) : '',
      ]);
    },
  },
];

function b64url(s: string | Buffer) {
  return Buffer.from(s).toString('base64url');
}

async function accessToken(): Promise<string> {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (!email || !key)
    throw new UserError(
      'Google service account is not configured (GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY).',
    );
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(
    JSON.stringify({
      iss: email,
      scope: 'https://www.googleapis.com/auth/spreadsheets',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    }),
  );
  const sig = createSign('RSA-SHA256').update(`${header}.${claim}`).sign(key).toString('base64url');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${header}.${claim}.${sig}`,
    }),
  });
  if (!res.ok) throw new UserError(`Google sign-in for the service account failed (${res.status}).`);
  return ((await res.json()) as { access_token: string }).access_token;
}

async function sheetsCall(token: string, url: string, body: unknown) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text();
    let msg = `HTTP ${res.status}`;
    try {
      msg = (JSON.parse(t) as { error?: { message?: string } }).error?.message ?? msg;
    } catch {}
    throw new Error(msg);
  }
}

export interface TabResult {
  tab: string;
  ok: boolean;
  rows: number;
  error?: string;
}

/** Write one tab per table, clearing each tab first. Missing tabs are created. */
export async function syncToSheets(actor: CurrentUser | null): Promise<TabResult[]> {
  if (actor) requirePermission(actor, 'sheets.sync');
  const cfg = await getSetting('sheets');
  const sheetId = cfg.sheetId || process.env.GOOGLE_SHEET_ID || '';
  if (!sheetId) throw new UserError('Link a Google Sheet first.');
  const token = await accessToken();
  const base = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}`;

  // Ensure every tab exists.
  const meta = await fetch(`${base}?fields=sheets.properties.title`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!meta.ok)
    throw new UserError(
      `Could not open the sheet (${meta.status}). Share it with the service account as an editor.`,
    );
  const existing = new Set(
    ((await meta.json()) as { sheets: { properties: { title: string } }[] }).sheets.map(
      (s) => s.properties.title,
    ),
  );
  const missing = TABS.filter((t) => !existing.has(t.name));
  if (missing.length) {
    await sheetsCall(token, `${base}:batchUpdate`, {
      requests: missing.map((t) => ({ addSheet: { properties: { title: t.name } } })),
    });
  }

  const results: TabResult[] = [];
  for (const tab of TABS) {
    try {
      const rows = await tab.rows();
      await sheetsCall(token, `${base}/values:batchClear`, { ranges: [`${tab.name}!A1:Z100000`] });
      await sheetsCall(token, `${base}/values:batchUpdate`, {
        valueInputOption: 'RAW',
        data: [{ range: `${tab.name}!A1`, values: [tab.head, ...rows] }],
      });
      results.push({ tab: tab.name, ok: true, rows: rows.length });
    } catch (e) {
      results.push({ tab: tab.name, ok: false, rows: 0, error: e instanceof Error ? e.message : String(e) });
    }
  }
  await setSetting('sheets', {
    sheetId,
    lastSyncAt: new Date().toISOString(),
    lastSyncBy: actor?.name ?? 'Nightly backup',
    lastResults: results,
  });
  await db.$transaction((tx) => writeAudit(tx, actor, 'sheets.sync', 'Setting', 'sheets', { results }));
  return results;
}
