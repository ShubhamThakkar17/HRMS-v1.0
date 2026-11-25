'use server';
import { z } from 'zod';
import { requireUserOrThrow } from '../current-user';
import { act, formObject, type ActionState } from '../action';
import { addGeoZone, removeGeoZone, setGeoPolicy } from '../services/geofence';
import { UserError } from '../errors';
import { parseLatLng } from '@/lib/geo';

export async function geoPolicyAction(_: ActionState, fd: FormData) {
  return act(async () => {
    const v = z
      .object({
        employeeId: z.string().min(1),
        rule: z.enum(['ANY_OFFICE', 'ASSIGNED_OFFICE', 'OFFICES_AND_ZONES', 'ZONES_ONLY', 'ANYWHERE']),
      })
      .parse(formObject(fd));
    await setGeoPolicy(await requireUserOrThrow(), v.employeeId, v.rule, fd.get('strict') === 'on');
    return 'Punch area saved.';
  });
}

export async function addZoneAction(_: ActionState, fd: FormData) {
  return act(async () => {
    const v = z
      .object({
        employeeId: z.string().min(1),
        name: z.string().trim().min(2, 'Name the zone, e.g. "Client site, Gandhinagar".').max(80),
        where: z.string().trim().min(3, 'Paste a map link or type latitude, longitude.'),
        radiusM: z.coerce
          .number()
          .int()
          .min(50, 'Radius at least 50 m.')
          .max(20_000, 'Radius at most 20 km.'),
      })
      .parse(formObject(fd));
    const at = parseLatLng(v.where);
    if (!at)
      throw new UserError('Could not read a location. Paste a Google Maps link or type "23.0225, 72.5714".');
    await addGeoZone(await requireUserOrThrow(), v.employeeId, {
      name: v.name,
      lat: at.lat,
      lng: at.lng,
      radiusM: v.radiusM,
    });
    return 'Zone added.';
  });
}

export async function removeZoneAction(_: ActionState, fd: FormData) {
  return act(async () => {
    await removeGeoZone(await requireUserOrThrow(), z.string().parse(fd.get('id')));
    return 'Zone removed.';
  });
}
