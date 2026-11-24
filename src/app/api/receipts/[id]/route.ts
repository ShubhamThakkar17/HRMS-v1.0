import { NextResponse } from 'next/server';
import { requireUserOrThrow } from '@/server/current-user';
import { apiError } from '@/server/api';
import { assertCanViewReceipt } from '@/server/services/expenses';
import { signedUrl } from '@/server/services/storage';

/** Checks who may see the receipt, then redirects to a short-lived signed URL. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUserOrThrow();
    const { id } = await params;
    const claim = await assertCanViewReceipt(user, id);
    const url = await signedUrl(claim.receiptKey!, 300);
    return NextResponse.redirect(new URL(url, _req.url), 302);
  } catch (e) {
    return apiError(e);
  }
}
