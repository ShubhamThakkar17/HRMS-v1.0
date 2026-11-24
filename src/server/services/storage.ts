import 'server-only';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createHmac, timingSafeEqual } from 'node:crypto';

// Receipt storage. "local" writes to ./.data/receipts (development only).
// "supabase" uses Supabase Storage (private bucket) through its REST API.

export const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;
export const RECEIPT_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'application/pdf': 'pdf',
};

const driver = () => process.env.STORAGE_DRIVER ?? 'local';
const localRoot = () => resolve(process.cwd(), '.data', 'receipts');

function supa() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = process.env.SUPABASE_BUCKET ?? 'receipts';
  if (!url || !key) throw new Error('Supabase storage is not configured');
  return { url: url.replace(/\/$/, ''), key, bucket };
}

/** Sniff the real file type from magic bytes rather than trusting the browser. */
export function sniffType(buf: Buffer): string | null {
  if (buf.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return 'image/jpeg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    return 'image/png';
  if (buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP')
    return 'image/webp';
  if (buf.subarray(0, 5).toString() === '%PDF-') return 'application/pdf';
  if (
    buf.subarray(4, 12).toString().startsWith('ftyphei') ||
    buf.subarray(4, 12).toString().startsWith('ftypmif1')
  )
    return 'image/heic';
  return null;
}

export async function putObject(key: string, body: Buffer, contentType: string): Promise<void> {
  if (driver() === 'supabase') {
    const s = supa();
    const res = await fetch(`${s.url}/storage/v1/object/${s.bucket}/${key}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${s.key}`, 'Content-Type': contentType, 'x-upsert': 'true' },
      body: new Uint8Array(body),
    });
    if (!res.ok) throw new Error(`Upload failed (${res.status})`);
    return;
  }
  const path = join(localRoot(), key);
  await mkdir(join(path, '..'), { recursive: true });
  await writeFile(path, body);
}

/** A short-lived URL for a private object. */
export async function signedUrl(key: string, expiresInS = 300): Promise<string> {
  if (driver() === 'supabase') {
    const s = supa();
    const res = await fetch(`${s.url}/storage/v1/object/sign/${s.bucket}/${key}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${s.key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expiresIn: expiresInS }),
    });
    if (!res.ok) throw new Error(`Could not sign URL (${res.status})`);
    const j = (await res.json()) as { signedURL: string };
    return `${s.url}/storage/v1${j.signedURL}`;
  }
  const exp = Math.floor(Date.now() / 1000) + expiresInS;
  return `/api/files/${encodeURIComponent(key)}?exp=${exp}&sig=${signLocal(key, exp)}`;
}

function signLocal(key: string, exp: number): string {
  return createHmac('sha256', process.env.AUTH_SECRET ?? 'dev')
    .update(`${key}:${exp}`)
    .digest('base64url');
}

export function verifyLocalSignature(key: string, exp: number, sig: string): boolean {
  if (!Number.isFinite(exp) || exp < Date.now() / 1000) return false;
  const a = Buffer.from(signLocal(key, exp));
  const b = Buffer.from(sig);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function readLocalObject(key: string): Promise<Buffer> {
  const root = localRoot();
  const path = resolve(root, key);
  if (!path.startsWith(root + '/')) throw new Error('Bad key');
  return readFile(path);
}
