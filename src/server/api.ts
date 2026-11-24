import 'server-only';
import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { httpStatusOf } from './errors';
import { errorMessage } from './action';

/** Reject cross-site mutation requests (CSRF) by checking the Origin header. */
export function assertSameOrigin(req: Request) {
  const origin = req.headers.get('origin');
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  if (!origin || !host)
    throw Object.assign(new Error('Cross-site request blocked.'), { status: 403, name: 'ForbiddenError' });
  if (new URL(origin).host !== host)
    throw Object.assign(new Error('Cross-site request blocked.'), { status: 403, name: 'ForbiddenError' });
}

export function apiError(e: unknown) {
  const status = e instanceof ZodError ? 400 : httpStatusOf(e);
  return NextResponse.json({ error: errorMessage(e) }, { status });
}

/** Vercel Cron sends Authorization: Bearer $CRON_SECRET. */
export function assertCron(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    throw Object.assign(new Error('Unauthorised'), { status: 401, name: 'UnauthorizedError' });
  }
}
