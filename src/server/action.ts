import 'server-only';
import { revalidatePath } from 'next/cache';
import { ZodError } from 'zod';
import { isRedirectError } from 'next/dist/client/components/redirect-error';

export type ActionState = { ok: boolean; message: string; at: number; data?: unknown } | null;

/** Run a server action body, turning known errors into a message for the form. */
export async function act(
  fn: () => Promise<string | { message: string; data?: unknown } | void>,
): Promise<ActionState> {
  try {
    const r = await fn();
    revalidatePath('/', 'layout');
    const message = typeof r === 'string' ? r : (r?.message ?? 'Saved.');
    return { ok: true, message, at: Date.now(), data: typeof r === 'object' ? r?.data : undefined };
  } catch (e) {
    if (isRedirectError(e)) throw e;
    return { ok: false, message: errorMessage(e), at: Date.now() };
  }
}

export function errorMessage(e: unknown): string {
  if (e instanceof ZodError) return e.issues.map((i) => i.message).join(' ');
  if (
    e instanceof Error &&
    ['UserError', 'ForbiddenError', 'UnauthorizedError', 'NotFoundError'].includes(e.name)
  )
    return e.message;
  console.error(e);
  return 'Something went wrong. Please try again.';
}

/** FormData → plain object of strings (last value wins), for Zod parsing. */
export function formObject(fd: FormData): Record<string, string> {
  const o: Record<string, string> = {};
  for (const [k, v] of fd.entries()) if (typeof v === 'string') o[k] = v;
  return o;
}
