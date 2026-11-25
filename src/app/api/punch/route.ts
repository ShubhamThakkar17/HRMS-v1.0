import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUserOrThrow } from '@/server/current-user';
import { apiError, assertSameOrigin } from '@/server/api';
import { handlePunch } from '@/server/services/punch';
import { istTime } from '@/lib/dates';

const Body = z.object({
  method: z.enum(['WEB', 'GEO', 'FACE', 'KIOSK']),
  location: z
    .object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
      accuracyM: z.number().min(0).max(100_000),
    })
    .nullish(),
  descriptor: z.array(z.number()).length(128).nullish(),
  code: z.string().max(12).nullish(),
  locationConsent: z.boolean().optional(),
});

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const user = await requireUserOrThrow();
    const body = Body.parse(await req.json());
    const r = await handlePunch(user, { ...body, deviceInfo: req.headers.get('user-agent') });
    return NextResponse.json({
      direction: r.direction,
      time: istTime(r.punch.at),
      status: r.day?.status ?? null,
      officeId: r.punch.officeId,
      zoneName: r.punch.zoneName,
      distanceM: r.punch.distanceM,
      flag: r.punch.flag,
      faceScore: r.punch.faceScore,
    });
  } catch (e) {
    return apiError(e);
  }
}
