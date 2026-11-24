import { NextResponse } from 'next/server';
import { apiError, assertCron } from '@/server/api';
import { yearlyRollover } from '@/server/services/leave';
import { businessDate } from '@/lib/dates';

/** 1 January: open the new year's leave balances with carry forward. */
export async function GET(req: Request) {
  try {
    assertCron(req);
    const year = Number(new URL(req.url).searchParams.get('year')) || Number(businessDate().slice(0, 4));
    return NextResponse.json({ year, ...(await yearlyRollover(year)) });
  } catch (e) {
    return apiError(e);
  }
}
