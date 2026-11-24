import { NextResponse } from 'next/server';
import { apiError, assertCron } from '@/server/api';
import { finaliseDay } from '@/server/services/attendance';
import { pruneRateEvents } from '@/server/ratelimit';
import { businessDate, isISODate } from '@/lib/dates';

/** 23:30 IST (18:00 UTC): finalise today and mark absences. ?date=YYYY-MM-DD re-runs a past day. */
export async function GET(req: Request) {
  try {
    assertCron(req);
    const q = new URL(req.url).searchParams.get('date');
    const date = q && isISODate(q) ? q : businessDate();
    const counts = await finaliseDay(date);
    await pruneRateEvents();
    return NextResponse.json({ date, counts });
  } catch (e) {
    return apiError(e);
  }
}
