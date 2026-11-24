import 'server-only';
import { randomInt } from 'node:crypto';
import { db } from '../db';
import { safeEqualHex, sha256 } from '../crypto';

const TTL_MS = 10 * 60_000;
const MAX_ATTEMPTS = 5;

export async function createEmailCode(email: string): Promise<string> {
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  await db.verificationCode.deleteMany({ where: { email } });
  await db.verificationCode.create({
    data: { email, codeHash: sha256(`${email}:${code}`), expiresAt: new Date(Date.now() + TTL_MS) },
  });
  return code;
}

export async function verifyEmailCode(email: string, code: string): Promise<boolean> {
  const row = await db.verificationCode.findFirst({
    where: { email, usedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  });
  if (!row || row.attempts >= MAX_ATTEMPTS) return false;
  if (!safeEqualHex(row.codeHash, sha256(`${email}:${code}`))) {
    await db.verificationCode.update({ where: { id: row.id }, data: { attempts: { increment: 1 } } });
    return false;
  }
  await db.verificationCode.update({ where: { id: row.id }, data: { usedAt: new Date() } });
  return true;
}
