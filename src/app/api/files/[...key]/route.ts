import { NextResponse } from 'next/server';
import { readLocalObject, sniffType, verifyLocalSignature } from '@/server/services/storage';

/** Serves local-driver receipts behind an HMAC-signed, expiring URL (development storage only). */
export async function GET(req: Request, { params }: { params: Promise<{ key: string[] }> }) {
  if ((process.env.STORAGE_DRIVER ?? 'local') !== 'local')
    return new NextResponse('Not found', { status: 404 });
  const { key } = await params;
  const k = key.map(decodeURIComponent).join('/');
  const u = new URL(req.url);
  if (!verifyLocalSignature(k, Number(u.searchParams.get('exp')), u.searchParams.get('sig') ?? '')) {
    return new NextResponse('Link expired', { status: 403 });
  }
  try {
    const buf = await readLocalObject(k);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        'Content-Type': sniffType(buf) ?? 'application/octet-stream',
        'Cache-Control': 'private, no-store',
        'Content-Disposition': 'inline',
      },
    });
  } catch {
    return new NextResponse('Not found', { status: 404 });
  }
}
