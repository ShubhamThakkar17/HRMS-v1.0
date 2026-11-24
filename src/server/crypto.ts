import 'server-only';
import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto';

function key(name: 'FACE_TEMPLATE_KEY' | 'APP_ENCRYPTION_KEY'): Buffer {
  const raw = process.env[name];
  if (!raw) throw new Error(`${name} is not set`);
  const k = Buffer.from(raw, 'base64');
  if (k.length !== 32) throw new Error(`${name} must be 32 bytes, base64 encoded`);
  return k;
}

/** AES-256-GCM. Output layout: 12-byte IV | 16-byte tag | ciphertext. */
export function encrypt(plain: Buffer, keyName: 'FACE_TEMPLATE_KEY' | 'APP_ENCRYPTION_KEY'): Buffer {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(keyName), iv);
  const body = Buffer.concat([c.update(plain), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), body]);
}

export function decrypt(blob: Buffer, keyName: 'FACE_TEMPLATE_KEY' | 'APP_ENCRYPTION_KEY'): Buffer {
  const iv = blob.subarray(0, 12);
  const tag = blob.subarray(12, 28);
  const body = blob.subarray(28);
  const d = createDecipheriv('aes-256-gcm', key(keyName), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(body), d.final()]);
}

export function encryptString(s: string): string {
  return encrypt(Buffer.from(s, 'utf8'), 'APP_ENCRYPTION_KEY').toString('base64');
}

export function decryptString(s: string): string {
  return decrypt(Buffer.from(s, 'base64'), 'APP_ENCRYPTION_KEY').toString('utf8');
}

export function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

export function safeEqualHex(a: string, b: string): boolean {
  const x = Buffer.from(a, 'hex');
  const y = Buffer.from(b, 'hex');
  return x.length === y.length && timingSafeEqual(x, y);
}

export function randomToken(bytes = 24): string {
  return randomBytes(bytes).toString('base64url');
}
