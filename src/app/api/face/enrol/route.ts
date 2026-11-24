import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUserOrThrow } from '@/server/current-user';
import { apiError, assertSameOrigin } from '@/server/api';
import { enrolFace } from '@/server/services/face';
import { rateLimit } from '@/server/ratelimit';
import { UserError } from '@/server/errors';

const Body = z.object({
  samples: z.array(z.array(z.number()).length(128)).min(1).max(3),
  consentVersion: z.string().max(40),
});

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const user = await requireUserOrThrow();
    if (!(await rateLimit(`face-enrol:${user.id}`, 10, 60 * 60_000)))
      throw new UserError('Too many enrolment attempts. Try again later.');
    const body = Body.parse(await req.json());
    await enrolFace(user, body.samples, body.consentVersion);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
