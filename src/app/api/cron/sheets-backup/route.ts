import { NextResponse } from 'next/server';
import { apiError, assertCron } from '@/server/api';
import { syncToSheets } from '@/server/services/sheets';

/** Nightly Google Sheets backup. */
export async function GET(req: Request) {
  try {
    assertCron(req);
    const results = await syncToSheets(null);
    return NextResponse.json({ results }, { status: results.every((r) => r.ok) ? 200 : 207 });
  } catch (e) {
    return apiError(e);
  }
}
