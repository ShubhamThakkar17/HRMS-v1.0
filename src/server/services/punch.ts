import 'server-only';
import { db } from '../db';
import { getSetting } from '../settings';
import { recordPunch } from './attendance';
import { matchFace } from './face';
import { resolveKioskCode } from './kiosk';
import { rateLimit } from '../ratelimit';
import type { CurrentUser } from '../rbac';
import { UserError } from '../errors';
import { evaluateGeoPunch, MAX_ACCURACY_M, type Reading } from '@/lib/geo';

export const LOCATION_CONSENT_VERSION = 'location-v1-2026-11';

export interface PunchRequest {
  method: 'WEB' | 'GEO' | 'FACE' | 'KIOSK';
  location?: Reading | null;
  descriptor?: number[] | null;
  code?: string | null;
  locationConsent?: boolean;
  deviceInfo?: string | null;
}

async function ensureLocationConsent(user: CurrentUser, given: boolean | undefined) {
  const has = await db.consentRecord.findFirst({
    where: { employeeId: user.id, kind: 'LOCATION', withdrawnAt: null },
  });
  if (has) return;
  if (!given)
    throw new UserError('Please read the location notice and tick the box before a location punch.');
  await db.consentRecord.create({
    data: { employeeId: user.id, kind: 'LOCATION', version: LOCATION_CONSENT_VERSION },
  });
}

/** Validate a punch against company and office settings, then record it. Distances are always computed here. */
export async function handlePunch(user: CurrentUser, req: PunchRequest) {
  if (!(await rateLimit(`punch:${user.id}`, 10, 60_000)))
    throw new UserError('Too many punch attempts. Wait a minute and try again.');
  const settings = await getSetting('punch');
  const home = user.officeId ? await db.office.findUnique({ where: { id: user.officeId } }) : null;
  const offices = await db.office.findMany();

  const geo = async () => {
    if (!req.location) throw new UserError('Your location is needed for this punch.');
    await ensureLocationConsent(user, req.locationConsent);
    const d = evaluateGeoPunch(user.workMode, offices, req.location);
    if (!d.ok) {
      if (d.reason === 'INACCURATE') {
        throw new UserError(
          `Your location is only accurate to ${Math.round(req.location.accuracyM)} m (we need ${MAX_ACCURACY_M} m or better). Step outdoors or near a window and try again.`,
        );
      }
      throw new UserError('Your location could not be read. Please try again.');
    }
    return {
      lat: req.location.lat,
      lng: req.location.lng,
      accuracyM: Math.round(req.location.accuracyM),
      distanceM: d.distanceM,
      officeId: d.officeId,
      flag: d.flag,
    };
  };

  switch (req.method) {
    case 'WEB': {
      if (!settings.web) throw new UserError('The quick web punch is turned off. Use another method.');
      return recordPunch(user, { method: 'WEB', deviceInfo: req.deviceInfo });
    }
    case 'GEO': {
      if (!settings.geo || home?.geoEnabled === false)
        throw new UserError('Location punch is turned off for your office.');
      return recordPunch(user, { method: 'GEO', ...(await geo()), deviceInfo: req.deviceInfo });
    }
    case 'FACE': {
      if (!settings.face || home?.faceEnabled === false)
        throw new UserError('Face punch is turned off for your office.');
      const where = await geo();
      const { distance } = await matchFace(user, req.descriptor);
      return recordPunch(user, { method: 'FACE', ...where, faceScore: distance, deviceInfo: req.deviceInfo });
    }
    case 'KIOSK': {
      if (!settings.kiosk) throw new UserError('Office kiosk codes are turned off.');
      const code = (req.code ?? '').replace(/\s/g, '');
      if (!/^\d{6}$/.test(code)) throw new UserError('Enter the 6-digit code shown on the office screen.');
      const device = await resolveKioskCode(code);
      if (!device)
        throw new UserError('That code has expired or is not valid. Enter the code on the screen now.');
      return recordPunch(user, {
        method: 'KIOSK',
        lat: device.office.lat,
        lng: device.office.lng,
        accuracyM: 0,
        distanceM: 0,
        officeId: device.office.id,
        deviceInfo: `kiosk:${device.id}`,
      });
    }
  }
}
