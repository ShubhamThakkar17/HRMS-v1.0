import 'server-only';
import { db } from '../db';
import { decrypt, encrypt } from '../crypto';
import { writeAudit } from './audit';
import { getSetting } from '../settings';
import { isLimited, recordEvent } from '../ratelimit';
import type { CurrentUser } from '../rbac';
import { UserError } from '../errors';
import { MAX_SAMPLES, bestDistance, isDescriptor } from '@/lib/face';

export const FACE_CONSENT_VERSION = 'face-v1-2026-11';
const FAIL_LIMIT = 5;
const FAIL_WINDOW_MS = 10 * 60_000;

export async function enrolFace(user: CurrentUser, samples: unknown[], consentVersion: string) {
  if (consentVersion !== FACE_CONSENT_VERSION)
    throw new UserError('Please read and accept the current consent notice.');
  if (!samples.length || samples.length > MAX_SAMPLES)
    throw new UserError(`Capture between 1 and ${MAX_SAMPLES} samples.`);
  if (!samples.every(isDescriptor)) throw new UserError('The face samples were not valid. Please try again.');
  const blob = new Uint8Array(encrypt(Buffer.from(JSON.stringify(samples)), 'FACE_TEMPLATE_KEY'));
  const now = new Date();
  await db.$transaction(async (tx) => {
    await tx.faceTemplate.upsert({
      where: { employeeId: user.id },
      create: {
        employeeId: user.id,
        samples: blob,
        sampleCount: samples.length,
        consentAt: now,
        consentVersion,
      },
      update: { samples: blob, sampleCount: samples.length, consentAt: now, consentVersion },
    });
    await tx.consentRecord.updateMany({
      where: { employeeId: user.id, kind: 'FACE', withdrawnAt: null },
      data: { withdrawnAt: now },
    });
    await tx.consentRecord.create({
      data: { employeeId: user.id, kind: 'FACE', version: consentVersion, givenAt: now },
    });
    await writeAudit(tx, user, 'face.enrol', 'FaceTemplate', user.id, {
      samples: samples.length,
      consentVersion,
    });
  });
}

/** Withdrawing consent deletes the template and blocks face punch. */
export async function withdrawFace(user: CurrentUser) {
  const now = new Date();
  await db.$transaction(async (tx) => {
    await tx.faceTemplate.deleteMany({ where: { employeeId: user.id } });
    await tx.consentRecord.updateMany({
      where: { employeeId: user.id, kind: 'FACE', withdrawnAt: null },
      data: { withdrawnAt: now },
    });
    await writeAudit(tx, user, 'face.withdraw', 'FaceTemplate', user.id, {});
  });
}

export async function faceStatus(employeeId: string) {
  const t = await db.faceTemplate.findUnique({
    where: { employeeId },
    select: { sampleCount: true, consentAt: true, consentVersion: true, updatedAt: true },
  });
  return t;
}

/** Match on the server against the stored template. Rate limited to 5 failed matches per 10 minutes. */
export async function matchFace(user: CurrentUser, descriptor: unknown): Promise<{ distance: number }> {
  if (!isDescriptor(descriptor)) throw new UserError('No usable face found. Please try again.');
  const failKey = `face-fail:${user.id}`;
  if (await isLimited(failKey, FAIL_LIMIT, FAIL_WINDOW_MS)) {
    throw new UserError(
      'Too many failed face matches. Try again in 10 minutes, or use another punch method.',
    );
  }
  const t = await db.faceTemplate.findUnique({ where: { employeeId: user.id } });
  if (!t) throw new UserError('Enrol your face under My profile first.');
  const samples = JSON.parse(
    decrypt(Buffer.from(t.samples), 'FACE_TEMPLATE_KEY').toString('utf8'),
  ) as number[][];
  const { faceThreshold } = await getSetting('punch');
  const d = bestDistance(samples, descriptor);
  if (d === null || d > faceThreshold) {
    await recordEvent(failKey);
    throw new UserError('Your face did not match the enrolled template. Try again in better light.');
  }
  return { distance: d };
}
