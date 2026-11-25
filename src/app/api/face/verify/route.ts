import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUserOrThrow } from '@/server/current-user';
import { apiError, assertSameOrigin } from '@/server/api';
import { matchFace } from '@/server/services/face';
import { getSetting } from '@/server/settings';

const Body = z.object({ descriptor: z.array(z.number()).length(128) });

/** Check Face ID without punching (same matching and failure limits as a real punch). */
export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const user = await requireUserOrThrow();
    const { descriptor } = Body.parse(await req.json());
    const [{ distance }, { faceThreshold }] = await Promise.all([
      matchFace(user, descriptor),
      getSetting('punch'),
    ]);
    return NextResponse.json({ ok: true, distance, threshold: faceThreshold });
  } catch (e) {
    return apiError(e);
  }
}
