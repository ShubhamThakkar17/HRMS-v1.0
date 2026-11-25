import 'server-only';
import type { GeoRule } from '@prisma/client';
import { db } from '../db';
import { writeAudit } from './audit';
import { requirePermission, type CurrentUser } from '../rbac';
import { NotFoundError, UserError } from '../errors';

/** Change where one employee may punch (emp.edit). */
export async function setGeoPolicy(user: CurrentUser, employeeId: string, rule: GeoRule, strict: boolean) {
  requirePermission(user, 'emp.edit');
  return db.$transaction(async (tx) => {
    const e = await tx.employee.findUnique({
      where: { id: employeeId },
      include: { _count: { select: { zones: true } } },
    });
    if (!e) throw new NotFoundError('Employee');
    if (rule === 'ZONES_ONLY' && e._count.zones === 0)
      throw new UserError('Add at least one zone before choosing "zones only".');
    if (rule === 'ASSIGNED_OFFICE' && !e.officeId) throw new UserError('Give this person an office first.');
    await tx.employee.update({ where: { id: employeeId }, data: { geoRule: rule, geoStrict: strict } });
    await writeAudit(tx, user, 'geofence.policy', 'Employee', employeeId, {
      code: e.code,
      before: { rule: e.geoRule, strict: e.geoStrict },
      after: { rule, strict },
    });
  });
}

export async function addGeoZone(
  user: CurrentUser,
  employeeId: string,
  zone: { name: string; lat: number; lng: number; radiusM: number },
) {
  requirePermission(user, 'emp.edit');
  return db.$transaction(async (tx) => {
    const e = await tx.employee.findUnique({
      where: { id: employeeId },
      include: { _count: { select: { zones: true } } },
    });
    if (!e) throw new NotFoundError('Employee');
    if (e._count.zones >= 20) throw new UserError('A person can have at most 20 zones.');
    const z = await tx.geoZone.create({ data: { employeeId, ...zone } });
    await writeAudit(tx, user, 'geofence.zone.add', 'Employee', employeeId, { code: e.code, zone });
    return z;
  });
}

export async function removeGeoZone(user: CurrentUser, zoneId: string) {
  requirePermission(user, 'emp.edit');
  return db.$transaction(async (tx) => {
    const z = await tx.geoZone.findUnique({
      where: { id: zoneId },
      include: { employee: { include: { _count: { select: { zones: true } } } } },
    });
    if (!z) throw new NotFoundError('Zone');
    if (z.employee.geoRule === 'ZONES_ONLY' && z.employee._count.zones <= 1) {
      throw new UserError('This is their only zone and they punch in zones only. Change the rule first.');
    }
    await tx.geoZone.delete({ where: { id: zoneId } });
    await writeAudit(tx, user, 'geofence.zone.remove', 'Employee', z.employeeId, {
      code: z.employee.code,
      zone: z.name,
    });
  });
}
