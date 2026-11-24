import 'server-only';
import { db } from '../db';
import { decryptString, encryptString, randomToken, safeEqualHex, sha256 } from '../crypto';
import { writeAudit } from './audit';
import { requirePermission, type CurrentUser } from '../rbac';
import { NotFoundError, UserError } from '../errors';
import { kioskCode, newKioskSecret, secondsRemaining, verifyKioskCode } from '@/lib/kiosk';

/** Super Admin registers a kiosk; the returned token is shown once and embedded in the kiosk URL. */
export async function registerKiosk(user: CurrentUser, officeId: string, name: string) {
  requirePermission(user, 'settings.manage');
  const office = await db.office.findUnique({ where: { id: officeId } });
  if (!office) throw new UserError('Choose an office.');
  const token = randomToken();
  const device = await db.$transaction(async (tx) => {
    const d = await tx.kioskDevice.create({
      data: {
        officeId,
        name: name.trim(),
        secret: encryptString(newKioskSecret()),
        tokenHash: sha256(token),
      },
    });
    await writeAudit(tx, user, 'kiosk.register', 'KioskDevice', d.id, { officeId, name });
    return d;
  });
  return { device, token };
}

export async function revokeKiosk(user: CurrentUser, id: string) {
  requirePermission(user, 'settings.manage');
  await db.$transaction(async (tx) => {
    const d = await tx.kioskDevice.findUnique({ where: { id } });
    if (!d) throw new NotFoundError('Kiosk');
    await tx.kioskDevice.update({ where: { id }, data: { revokedAt: new Date() } });
    await writeAudit(tx, user, 'kiosk.revoke', 'KioskDevice', id, { name: d.name });
  });
}

/** The code a kiosk shows, after checking its access token. */
export async function kioskDisplay(deviceId: string, token: string) {
  const d = await db.kioskDevice.findUnique({ where: { id: deviceId }, include: { office: true } });
  if (!d || d.revokedAt || !safeEqualHex(d.tokenHash, sha256(token))) return null;
  await db.kioskDevice.update({ where: { id: deviceId }, data: { lastSeenAt: new Date() } });
  const now = Date.now();
  return {
    code: kioskCode(decryptString(d.secret), now),
    secondsLeft: secondsRemaining(now),
    office: d.office,
    name: d.name,
  };
}

/** Find the active kiosk whose current or previous code matches. */
export async function resolveKioskCode(code: string) {
  const devices = await db.kioskDevice.findMany({ where: { revokedAt: null }, include: { office: true } });
  const now = Date.now();
  return devices.find((d) => verifyKioskCode(decryptString(d.secret), code, now)) ?? null;
}
