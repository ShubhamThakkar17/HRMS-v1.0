/* Loads the same sample company as the prototype. All people and figures are invented. */
import { type PunchMethod, type Prisma } from '@prisma/client';
import { createPrismaClient } from '../src/server/prisma-client';
import { createCipheriv, createHash, randomBytes } from 'node:crypto';
import { rebuildDay, type PunchLike } from '../src/lib/attendance-rules';
import { addDays, businessDate, eachDay, istInstant, toDbDate, type ISODate } from '../src/lib/dates';
import { haversineM } from '../src/lib/geo';
import { holidaySetFor, countWorkingDays, isWorkingDay } from '../src/lib/leave-rules';
import { DEFAULT_ROLES, ROLE_ORDER } from '../src/lib/permissions';
import { newKioskSecret } from '../src/lib/kiosk';

const db = createPrismaClient();

function fnv(str: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hm(m: number) {
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}
function encryptForApp(s: string): string {
  const raw = process.env.APP_ENCRYPTION_KEY;
  if (!raw) throw new Error('APP_ENCRYPTION_KEY is not set');
  // Same key rule as src/server/crypto.ts.
  const b = Buffer.from(raw, 'base64');
  const key =
    b.length === 32 && /^[A-Za-z0-9+/]{43}=$/.test(raw)
      ? b
      : createHash('sha256').update(raw, 'utf8').digest();
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([c.update(Buffer.from(s)), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), body]).toString('base64');
}

type Mode = 'OFFICE' | 'HYBRID' | 'REMOTE';
const PEOPLE: [string, string, string, string, string, string, string, Mode, string, string[], number][] = [
  [
    'E001',
    'Meera Shah',
    'meera',
    'Leadership',
    'Director',
    '',
    '2019-04-01',
    'OFFICE',
    'HO',
    ['Director', 'Employee'],
    3600000,
  ],
  [
    'E002',
    'Aditya Parikh',
    'aditya',
    'Technology',
    'IT Administrator',
    'E001',
    '2021-02-15',
    'OFFICE',
    'HO',
    ['Super Admin', 'Employee'],
    1200000,
  ],
  [
    'E003',
    'Priya Desai',
    'priya',
    'HR',
    'HR Manager',
    'E001',
    '2021-04-12',
    'OFFICE',
    'HO',
    ['HR Admin', 'Employee'],
    1500000,
  ],
  [
    'E004',
    'Pooja Bhatt',
    'pooja',
    'HR',
    'HR Executive',
    'E003',
    '2023-07-03',
    'OFFICE',
    'HO',
    ['HR Executive', 'Employee'],
    600000,
  ],
  [
    'E005',
    'Neha Kapoor',
    'neha',
    'Finance',
    'Accounts Manager',
    'E001',
    '2022-09-02',
    'OFFICE',
    'HO',
    ['Finance', 'Employee'],
    1100000,
  ],
  [
    'E006',
    'Rohan Mehta',
    'rohan',
    'Marketing',
    'Team Lead, Marketing',
    'E001',
    '2022-01-10',
    'HYBRID',
    'HO',
    ['Manager', 'Employee'],
    1400000,
  ],
  [
    'E007',
    'Ananya Iyer',
    'ananya',
    'Marketing',
    'Marketing Executive',
    'E006',
    '2024-06-03',
    'OFFICE',
    'HO',
    ['Employee'],
    540000,
  ],
  [
    'E008',
    'Kunal Joshi',
    'kunal',
    'Marketing',
    'Graphic Designer',
    'E006',
    '2023-02-20',
    'OFFICE',
    'HO',
    ['Employee'],
    600000,
  ],
  [
    'E009',
    'Sneha Patel',
    'sneha',
    'Marketing',
    'Copywriter',
    'E006',
    '2023-08-14',
    'HYBRID',
    'HO',
    ['Employee'],
    560000,
  ],
  [
    'E010',
    'Arjun Nair',
    'arjun',
    'Media',
    'Social Media Executive',
    'E006',
    '2024-01-08',
    'HYBRID',
    'HO',
    ['Employee'],
    480000,
  ],
  [
    'E011',
    'Divya Rao',
    'divya',
    'Media',
    'Video Editor',
    'E006',
    '2025-03-17',
    'OFFICE',
    'VDR',
    ['Employee'],
    520000,
  ],
  [
    'E012',
    'Vikram Trivedi',
    'vikram',
    'Operations',
    'Operations Head',
    'E001',
    '2020-07-01',
    'OFFICE',
    'HO',
    ['Manager', 'Employee'],
    1800000,
  ],
  [
    'E013',
    'Manish Solanki',
    'manish',
    'Operations',
    'Operations Executive',
    'E012',
    '2023-11-06',
    'OFFICE',
    'VDR',
    ['Employee'],
    450000,
  ],
  [
    'E014',
    'Harsh Vyas',
    'harsh',
    'Sales',
    'Field Sales Executive',
    'E012',
    '2024-10-14',
    'REMOTE',
    'HO',
    ['Employee'],
    500000,
  ],
];

const HOLIDAYS: [string, string][] = [
  ['2026-01-26', 'Republic Day'],
  ['2026-08-15', 'Independence Day'],
  ['2026-10-02', 'Gandhi Jayanti'],
  ['2026-12-25', 'Christmas'],
  ['2027-01-01', 'New Year’s Day'],
  ['2027-01-14', 'Uttarayan'],
  ['2027-01-26', 'Republic Day'],
];

async function main() {
  const t = businessDate();
  const year = Number(t.slice(0, 4));
  const r = rng(fnv(`silver-touch-${t.slice(0, 7)}`));
  console.log(`Seeding sample company for ${t} (IST)…`);

  // Wipe in dependency order.
  await db.$transaction([
    db.auditLog.deleteMany(),
    db.rateEvent.deleteMany(),
    db.verificationCode.deleteMany(),
    db.punch.deleteMany(),
    db.attendanceDay.deleteMany(),
    db.leaveBalance.deleteMany(),
    db.leaveRequest.deleteMany(),
    db.regularisation.deleteMany(),
    db.expenseClaim.deleteMany(),
    db.announcement.deleteMany(),
    db.faceTemplate.deleteMany(),
    db.consentRecord.deleteMany(),
    db.kioskDevice.deleteMany(),
    db.employeeRole.deleteMany(),
    db.employee.deleteMany(),
    db.role.deleteMany(),
    db.holiday.deleteMany(),
    db.office.deleteMany(),
    db.shift.deleteMany(),
    db.leaveType.deleteMany(),
    db.setting.deleteMany(),
  ]);

  const roles = new Map<string, string>();
  for (const [i, name] of ROLE_ORDER.entries()) {
    const role = await db.role.create({
      data: { name, permissions: DEFAULT_ROLES[name] ?? [], isSystem: true, sortOrder: i },
    });
    roles.set(name, role.id);
  }

  const ho = await db.office.create({
    data: { code: 'HO', name: 'Head office, Ahmedabad', lat: 23.0225, lng: 72.5714, radiusM: 200 },
  });
  const vdr = await db.office.create({
    data: { code: 'VDR', name: 'Vadodara branch', lat: 22.3072, lng: 73.1812, radiusM: 200 },
  });
  const offices = { HO: ho, VDR: vdr } as const;
  const shift = await db.shift.create({
    data: {
      name: 'General',
      start: '09:30',
      end: '18:30',
      lateAfter: '09:40',
      shortDayHours: 4.5,
      isDefault: true,
    },
  });

  await db.leaveType.createMany({
    data: [
      { code: 'CL', name: 'Casual leave', annualDays: 12, carryForward: 0 },
      { code: 'SL', name: 'Sick leave', annualDays: 8, carryForward: 0 },
      { code: 'EL', name: 'Earned leave', annualDays: 15, carryForward: 5 },
    ],
  });
  await db.holiday.createMany({ data: HOLIDAYS.map(([date, name]) => ({ date: toDbDate(date), name })) });
  const holidays = holidaySetFor(
    HOLIDAYS.map(([date]) => ({ date, officeId: null })),
    null,
  );

  await db.setting.createMany({
    data: [
      { key: 'company', value: { name: 'Silver Touch' } },
      { key: 'punch', value: { web: true, geo: true, face: true, kiosk: true, faceThreshold: 0.5 } },
      { key: 'retention', value: { coordsDays: 90 } },
      {
        key: 'sheets',
        value: {
          sheetId: process.env.GOOGLE_SHEET_ID ?? '1bUB7J6GZZHG7sVV68fCjJ5h07TShwe10hIdWK7L_uEc',
          lastSyncAt: '',
          lastSyncBy: '',
          lastResults: [],
        },
      },
    ],
  });

  const ids = new Map<string, string>();
  for (const p of PEOPLE) {
    const e = await db.employee.create({
      data: {
        code: p[0],
        name: p[1],
        email: `${p[2]}@demo.example`,
        phone: `+91 98250 ${String(10201 + PEOPLE.indexOf(p)).slice(-5)}`,
        dept: p[3],
        title: p[4],
        joinedOn: toDbDate(p[6]),
        workMode: p[7],
        officeId: offices[p[8] as 'HO' | 'VDR'].id,
        ctcPaise: BigInt(p[10] * 100),
        roles: { create: p[9].map((n) => ({ roleId: roles.get(n)! })) },
      },
    });
    ids.set(p[0], e.id);
  }
  for (const p of PEOPLE)
    if (p[5])
      await db.employee.update({ where: { id: ids.get(p[0])! }, data: { managerId: ids.get(p[5])! } });
  const id = (code: string) => ids.get(code)!;

  // Leave balances for this year (and last year, so the 1 January carry-forward has data).
  const types = await db.leaveType.findMany();
  for (const code of ids.keys()) {
    for (const lt of types) {
      for (const y of [year - 1, year]) {
        await db.leaveBalance.create({
          data: {
            employeeId: id(code),
            leaveTypeCode: lt.code,
            year: y,
            opening: y === year && lt.carryForward ? Math.min(lt.carryForward, 3) : 0,
            accrued: lt.annualDays,
            used: y === year - 1 ? Math.floor(r() * lt.annualDays * 0.8) : 0,
          },
        });
      }
    }
  }

  function workdayNear(d: ISODate, dir: 1 | -1 = 1) {
    let g = 0;
    while (!isWorkingDay(d, holidays) && g++ < 10) d = addDays(d, dir);
    return d;
  }
  const approvedLeave: { emp: string; from: ISODate; to: ISODate }[] = [];
  async function lv(
    code: string,
    emp: string,
    type: string,
    from: ISODate,
    to: ISODate,
    status: 'PENDING' | 'APPROVED' | 'REJECTED',
    reason: string,
    approver?: string,
    comment?: string,
  ) {
    from = workdayNear(from);
    to = workdayNear(to);
    if (to < from) to = from;
    if (from.slice(0, 4) !== to.slice(0, 4)) to = `${from.slice(0, 4)}-12-31`;
    const days = countWorkingDays(from, to, holidays);
    await db.leaveRequest.create({
      data: {
        code,
        employeeId: id(emp),
        type,
        from: toDbDate(from),
        to: toDbDate(to),
        days,
        reason,
        status,
        approverId: approver ? id(approver) : null,
        comment: comment ?? null,
        decidedAt: status === 'PENDING' ? null : new Date(),
        createdAt: istInstant(addDays(from, -3) < t ? addDays(from, -3) : addDays(t, -1), '10:00'),
      },
    });
    if (status === 'APPROVED') {
      approvedLeave.push({ emp, from, to });
      await db.leaveBalance.update({
        where: {
          employeeId_leaveTypeCode_year: {
            employeeId: id(emp),
            leaveTypeCode: type,
            year: Number(from.slice(0, 4)),
          },
        },
        data: { used: { increment: days } },
      });
    }
  }
  await lv('LR-001', 'E007', 'CL', addDays(t, 2), addDays(t, 3), 'PENDING', 'Family function');
  await lv('LR-002', 'E010', 'SL', addDays(t, -4), addDays(t, -4), 'APPROVED', 'Fever', 'E006');
  await lv('LR-003', 'E013', 'EL', addDays(t, 7), addDays(t, 10), 'PENDING', 'Family wedding');
  await lv(
    'LR-004',
    'E009',
    'CL',
    addDays(t, -12),
    addDays(t, -12),
    'REJECTED',
    'Personal work',
    'E006',
    'Launch week, please pick another date.',
  );
  await lv('LR-005', 'E008', 'SL', addDays(t, -14), addDays(t, -13), 'APPROVED', 'Dental procedure', 'E006');
  await lv('LR-006', 'E004', 'CL', addDays(t, -7), addDays(t, -7), 'APPROVED', 'Bank work', 'E003');
  await lv('LR-007', 'E012', 'EL', addDays(t, 27), addDays(t, 30), 'PENDING', 'Year-end travel');
  const onLeave = (emp: string, d: ISODate) =>
    approvedLeave.some((l) => l.emp === emp && l.from <= d && l.to >= d);

  // Punches: about six weeks of history plus this morning's check-ins.
  const client = { lat: 23.2156, lng: 72.6369 }; // sample client site, Gandhinagar
  function jitter(o: { lat: number; lng: number }, metres: number) {
    const lat = +(o.lat + ((r() - 0.5) * 2 * metres) / 111000).toFixed(5);
    const lng = +(o.lng + ((r() - 0.5) * 2 * metres) / 102000).toFixed(5);
    return { lat, lng, accuracyM: 12 + Math.floor(r() * 25) };
  }
  type P = Prisma.PunchCreateManyInput;
  const punches: P[] = [];
  function punchMeta(
    mode: Mode,
    officeCode: 'HO' | 'VDR',
    remoteDay: boolean,
  ): Omit<P, 'employeeId' | 'at' | 'businessDate' | 'direction'> {
    const o = offices[officeCode];
    if (mode === 'REMOTE') {
      const c = jitter(client, 300);
      return { method: 'GEO', ...c, distanceM: haversineM(c.lat, c.lng, ho.lat, ho.lng), officeId: null };
    }
    if (remoteDay) {
      const h = jitter({ lat: ho.lat + 0.03, lng: ho.lng + 0.02 }, 80);
      return { method: 'GEO', ...h, distanceM: haversineM(h.lat, h.lng, ho.lat, ho.lng), officeId: null };
    }
    const x = r();
    if (x < 0.55) {
      const j = jitter(o, 60);
      return {
        method: 'FACE',
        ...j,
        distanceM: haversineM(j.lat, j.lng, o.lat, o.lng),
        officeId: o.id,
        faceScore: +(0.28 + r() * 0.15).toFixed(2),
      };
    }
    if (x < 0.8)
      return { method: 'KIOSK', lat: o.lat, lng: o.lng, accuracyM: 0, distanceM: 0, officeId: o.id };
    if (x < 0.95) {
      const j = jitter(o, 120);
      return { method: 'GEO', ...j, distanceM: haversineM(j.lat, j.lng, o.lat, o.lng), officeId: o.id };
    }
    return { method: 'WEB', officeId: null };
  }
  const start = addDays(t, -45);
  for (const p of PEOPLE) {
    const [code, , , , , , joined, mode, officeCode] = p;
    for (const d of eachDay(start, addDays(t, -1))) {
      if (!isWorkingDay(d, holidays) || joined > d || onLeave(code, d)) continue;
      if (r() < 0.05) continue; // the odd absence
      const meta = punchMeta(mode, officeCode as 'HO' | 'VDR', mode === 'HYBRID' && r() < 0.3);
      const inAt = istInstant(d, hm(540 + Math.floor(r() * 58)));
      const outAt = istInstant(d, hm(1065 + Math.floor(r() * 90)));
      punches.push({ employeeId: id(code), at: inAt, businessDate: toDbDate(d), direction: 'IN', ...meta });
      punches.push({
        employeeId: id(code),
        at: outAt,
        businessDate: toDbDate(d),
        direction: 'OUT',
        ...meta,
        faceScore: meta.faceScore ? +(0.28 + r() * 0.15).toFixed(2) : null,
      });
    }
    if (isWorkingDay(t, holidays) && !['E007', 'E011', 'E014'].includes(code) && !onLeave(code, t)) {
      const meta = punchMeta(mode, officeCode as 'HO' | 'VDR', false);
      punches.push({
        employeeId: id(code),
        at: istInstant(t, hm(540 + Math.floor(r() * 45))),
        businessDate: toDbDate(t),
        direction: 'IN',
        ...meta,
      });
    }
  }
  // One office-based punch from far away, to show the geofence flag on Team overview.
  const farDay = workdayNear(addDays(t, -3), -1);
  const far = punches.find(
    (x) =>
      x.employeeId === id('E008') &&
      (x.businessDate as Date).getTime() === toDbDate(farDay).getTime() &&
      x.direction === 'IN',
  );
  if (far)
    Object.assign(far, {
      method: 'GEO' as PunchMethod,
      lat: 23.07,
      lng: 72.61,
      accuracyM: 18,
      distanceM: haversineM(23.07, 72.61, ho.lat, ho.lng),
      officeId: null,
      flag: 'OUTSIDE_GEOFENCE',
      faceScore: null,
    });

  // Regularisations (and the punch gaps they explain).
  const rg1 = workdayNear(addDays(t, -6), -1);
  const rg2 = workdayNear(addDays(t, -5), -1);
  const drop = (emp: string, d: ISODate, dir?: 'OUT') => {
    for (let i = punches.length - 1; i >= 0; i--) {
      const x = punches[i]!;
      if (
        x.employeeId === id(emp) &&
        (x.businessDate as Date).getTime() === toDbDate(d).getTime() &&
        (!dir || x.direction === dir)
      )
        punches.splice(i, 1);
    }
  };
  drop('E008', rg1, 'OUT');
  drop('E013', rg2);
  await db.punch.createMany({ data: punches });

  await db.regularisation.createMany({
    data: [
      {
        code: 'RG-001',
        employeeId: id('E008'),
        date: toDbDate(rg1),
        inTime: '09:20',
        outTime: '18:35',
        reason: 'Forgot to punch out',
        status: 'PENDING',
      },
      {
        code: 'RG-002',
        employeeId: id('E013'),
        date: toDbDate(rg2),
        inTime: '09:30',
        outTime: '18:30',
        reason: 'At a vendor site all day, missed the punch',
        status: 'PENDING',
      },
      {
        code: 'RG-003',
        employeeId: id('E010'),
        date: toDbDate(workdayNear(addDays(t, -8), -1)),
        inTime: '09:35',
        outTime: '18:40',
        reason: 'Phone battery died at check-in',
        status: 'APPROVED',
        approverId: id('E006'),
        decidedAt: new Date(),
      },
    ],
  });

  // Build AttendanceDay rows from the punches (finalised for past days).
  const all = await db.punch.findMany();
  const byKey = new Map<string, PunchLike[]>();
  for (const p of all) {
    const k = `${p.employeeId}|${p.businessDate.toISOString().slice(0, 10)}`;
    const list = byKey.get(k) ?? [];
    list.push(p);
    byKey.set(k, list);
  }
  const dayRows: Prisma.AttendanceDayCreateManyInput[] = [];
  for (const p of PEOPLE) {
    const [code, , , , , , joined] = p;
    for (const d of eachDay(start, t)) {
      if (joined > d) continue;
      const ps = byKey.get(`${id(code)}|${d}`) ?? [];
      const res = rebuildDay(ps, { date: d, shift, isHoliday: holidays.has(d), onLeave: onLeave(code, d) });
      if (d === t && !ps.length && res.status === 'ABSENT') continue;
      dayRows.push({
        employeeId: id(code),
        businessDate: toDbDate(d),
        firstIn: res.firstIn,
        lastOut: res.lastOut,
        hours: res.hours,
        status: res.status,
        inMethod: res.inMethod as PunchMethod | null,
        outMethod: res.outMethod as PunchMethod | null,
        officeId: res.officeId,
        remote: res.remote,
        flagged: res.flagged,
        finalised: d < t,
      });
    }
  }
  await db.attendanceDay.createMany({ data: dayRows });

  // Expense claims.
  const ex = (
    code: string,
    emp: string,
    d: ISODate,
    category: string,
    rupees: number,
    note: string,
    status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'REIMBURSED',
    approver?: string,
    paidBy?: string,
    comment?: string,
  ) => ({
    code,
    employeeId: id(emp),
    date: toDbDate(d),
    category,
    amountPaise: BigInt(rupees * 100),
    note,
    status,
    approverId: approver ? id(approver) : null,
    paidById: paidBy ? id(paidBy) : null,
    comment: comment ?? null,
    decidedAt: status === 'PENDING' ? null : new Date(),
    paidAt: status === 'REIMBURSED' ? new Date() : null,
  });
  await db.expenseClaim.createMany({
    data: [
      ex('EX-001', 'E014', addDays(t, -2), 'Travel', 1850, 'Client visits, Gandhinagar', 'PENDING'),
      ex(
        'EX-002',
        'E006',
        addDays(t, -5),
        'Client meeting',
        2400,
        'Lunch with campaign client',
        'APPROVED',
        'E001',
      ),
      ex(
        'EX-003',
        'E010',
        addDays(t, -9),
        'Internet',
        799,
        'Home broadband, remote days',
        'REIMBURSED',
        'E006',
        'E005',
      ),
      ex('EX-004', 'E007', addDays(t, -1), 'Food', 650, 'Team lunch on shoot day', 'PENDING'),
      ex(
        'EX-005',
        'E008',
        addDays(t, -11),
        'Travel',
        420,
        'Cab to print vendor',
        'REJECTED',
        'E006',
        undefined,
        'Please attach the cab receipt.',
      ),
    ],
  });

  await db.announcement.createMany({
    data: [
      {
        title: 'Welcome to Silver Touch HRMS',
        body: 'This system is loaded with sample data. Try the different demo profiles to see what each role can do.',
        authorId: id('E003'),
        pinned: true,
        publishedAt: istInstant(addDays(t, -3), '10:00'),
      },
      {
        title: 'Face punch is open for the pilot',
        body: 'Enrol your face once under My profile, then check in from the Punch page.',
        authorId: id('E002'),
        publishedAt: istInstant(addDays(t, -2), '10:00'),
      },
      {
        title: 'Submit expense claims by month end',
        body: 'Claims approved by your manager are reimbursed in the next pay cycle.',
        authorId: id('E005'),
        publishedAt: istInstant(addDays(t, -1), '10:00'),
      },
    ],
  });

  // A demo reception kiosk for the head office.
  const kioskToken = 'demo-kiosk-token';
  const kiosk = await db.kioskDevice.create({
    data: {
      officeId: ho.id,
      name: 'Head office reception',
      secret: encryptForApp(newKioskSecret()),
      tokenHash: createHash('sha256').update(kioskToken).digest('hex'),
    },
  });

  await db.auditLog.create({
    data: {
      role: 'system',
      action: 'seed',
      entity: 'System',
      entityId: null,
      detail: { employees: PEOPLE.length, punches: all.length, days: dayRows.length },
    },
  });
  console.log(`Done: ${PEOPLE.length} employees, ${all.length} punches, ${dayRows.length} attendance days.`);
  console.log(`Demo kiosk: /kiosk/${kiosk.id}?k=${kioskToken}`);
  console.log('Demo sign-in (AUTH_DEMO=true): any seeded email such as priya@demo.example, password demo123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
