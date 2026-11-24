import { NextResponse } from 'next/server';
import { requireUserOrThrow } from '@/server/current-user';
import { requirePermission } from '@/server/rbac';
import { apiError } from '@/server/api';
import { IMPORT_TEMPLATE } from '@/server/services/import';

export async function GET() {
  try {
    requirePermission(await requireUserOrThrow(), 'emp.edit');
    return new NextResponse(IMPORT_TEMPLATE, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="employee-import-template.csv"',
      },
    });
  } catch (e) {
    return apiError(e);
  }
}
