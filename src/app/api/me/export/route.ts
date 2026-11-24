import { NextResponse } from 'next/server';
import { requireUserOrThrow } from '@/server/current-user';
import { apiError } from '@/server/api';
import { exportOwnData } from '@/server/services/privacy';
import { businessDate } from '@/lib/dates';

export async function GET() {
  try {
    const user = await requireUserOrThrow();
    const data = await exportOwnData(user);
    const body = JSON.stringify(data, (_k, v) => (typeof v === 'bigint' ? Number(v) : v), 2);
    return new NextResponse(body, {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="my-hrms-data-${user.code}-${businessDate()}.json"`,
      },
    });
  } catch (e) {
    return apiError(e);
  }
}
