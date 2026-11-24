import { NextResponse } from 'next/server';
import { apiError, assertCron } from '@/server/api';
import { purgeOldCoordinates } from '@/server/services/privacy';

/** Daily: delete precise punch coordinates older than the retention period. */
export async function GET(req: Request) {
  try {
    assertCron(req);
    return NextResponse.json(await purgeOldCoordinates());
  } catch (e) {
    return apiError(e);
  }
}
