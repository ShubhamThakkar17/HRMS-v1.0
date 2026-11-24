import { NextResponse } from 'next/server';
import { kioskDisplay } from '@/server/services/kiosk';

/** The kiosk tablet polls this with its access token. */
export async function GET(req: Request, { params }: { params: Promise<{ deviceId: string }> }) {
  const { deviceId } = await params;
  const token = new URL(req.url).searchParams.get('k') ?? '';
  const d = await kioskDisplay(deviceId, token);
  if (!d)
    return NextResponse.json(
      { error: 'This kiosk is not registered or has been revoked.' },
      { status: 403, headers: { 'Cache-Control': 'no-store' } },
    );
  return NextResponse.json(
    { code: d.code, secondsLeft: d.secondsLeft },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
