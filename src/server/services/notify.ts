import 'server-only';

export interface Email {
  to: string | string[];
  subject: string;
  text: string;
  link?: string;
}

function baseUrl(): string {
  return (process.env.APP_BASE_URL ?? process.env.AUTH_URL ?? 'http://localhost:3000').replace(/\/$/, '');
}

/** Send a transactional email through Resend. Without RESEND_API_KEY the email is logged instead. Never throws. */
export async function sendEmail(mail: Email): Promise<void> {
  const to = (Array.isArray(mail.to) ? mail.to : [mail.to]).filter(Boolean);
  if (!to.length) return;
  const body = mail.link ? `${mail.text}\n\nOpen: ${baseUrl()}${mail.link}` : mail.text;
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    if (process.env.NODE_ENV !== 'test')
      console.info(`[email] to=${to.join(',')} subject="${mail.subject}"\n${body}`);
    return;
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM ?? 'HRMS <hrms@example.com>',
        to,
        subject: mail.subject,
        text: body,
      }),
    });
    if (!res.ok) console.error('[email] send failed', res.status, await res.text());
  } catch (e) {
    console.error('[email] send failed', e);
  }
}

/** Fire-and-forget notifications after a transaction commits. */
export function notifyLater(mails: Email[]): void {
  void Promise.all(mails.map(sendEmail));
}
