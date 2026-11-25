import { redirect } from 'next/navigation';
import { CheckCircle2, FileSpreadsheet, History, Link2 } from 'lucide-react';
import { requireUser } from '@/server/current-user';
import { getSetting } from '@/server/settings';
import { linkSheetAction } from '@/server/actions/company';
import { TABS, sheetsTransport } from '@/server/services/sheets';
import { fmtDateTime } from '@/lib/dates';
import { ActionForm, Submit } from '@/components/forms';
import { Card, PageHead, Pill, Stack, Table, Two } from '@/components/ui';
import { SyncNow } from './sync-now';

export const metadata = { title: 'Google Sheets sync' };

export default async function SyncPage() {
  const user = await requireUser();
  if (!user.permissions.has('sheets.sync')) redirect('/');
  const cfg = await getSetting('sheets');
  const transport = sheetsTransport();
  const sheetUrl = cfg.sheetId ? `https://docs.google.com/spreadsheets/d/${cfg.sheetId}/edit` : null;
  return (
    <Stack>
      <PageHead
        eyebrow="Admin"
        title="Google Sheets backup"
        lead="A copy of every table, one tab each. Runs every night at 02:00 IST; you can also sync now. Face templates and secrets are never exported."
        actions={
          sheetUrl ? (
            <a className="btn btn-ghost" href={sheetUrl} target="_blank" rel="noopener">
              <FileSpreadsheet className="size-4" /> Open sheet
            </a>
          ) : null
        }
      />
      <Two>
        <Card title="Connection" icon={<Link2 />}>
          {transport ? (
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="size-5 text-good" />
              Connected through{' '}
              {transport === 'apps-script' ? 'the Apps Script in the sheet' : 'a Google service account'}.
            </div>
          ) : (
            <div className="grid gap-2 text-sm">
              <Pill tone="warn">Not connected yet</Pill>
              <ol className="ml-5 list-decimal space-y-1 text-muted">
                <li>Open the backup sheet → Extensions → Apps Script.</li>
                <li>
                  Paste the receiver script from{' '}
                  <span className="font-mono text-xs">docs/google-sheets-apps-script.gs</span> with the shared
                  secret.
                </li>
                <li>Deploy as a Web app (execute as you, access: anyone) and copy its URL.</li>
                <li>
                  Set <span className="font-mono text-xs">GOOGLE_SHEETS_WEBHOOK_URL</span> and{' '}
                  <span className="font-mono text-xs">GOOGLE_SHEETS_WEBHOOK_SECRET</span> in Vercel.
                </li>
              </ol>
            </div>
          )}
          <ActionForm action={linkSheetAction} reset={false} className="mt-4 flex flex-wrap items-end gap-3">
            <label className="field min-w-64 flex-1">
              Sheet link (for the “Open sheet” button)
              <input name="sheet" defaultValue={sheetUrl ?? ''} required />
            </label>
            <Submit className="btn btn-ghost">Save link</Submit>
          </ActionForm>
        </Card>
        <Card title="Sync now" icon={<FileSpreadsheet />}>
          <SyncNow disabled={!transport} />
        </Card>
      </Two>
      <Card
        title="Last sync"
        icon={<History />}
        extra={
          cfg.lastSyncAt ? (
            <span className="text-[13px] text-muted">
              {fmtDateTime(new Date(cfg.lastSyncAt))} by {cfg.lastSyncBy}
            </span>
          ) : null
        }
      >
        <Table rows={TABS.length} head={['Tab', 'Result', '#Rows']}>
          {(cfg.lastResults.length
            ? cfg.lastResults
            : TABS.map((t) => ({ tab: t.name, ok: true, rows: 0, error: 'not synced yet' }))
          ).map((r) => (
            <tr key={r.tab}>
              <td className="font-medium">{r.tab}</td>
              <td>
                {r.error === 'not synced yet' ? (
                  <span className="text-muted">Not synced yet</span>
                ) : r.ok ? (
                  <Pill tone="good">OK</Pill>
                ) : (
                  <>
                    <Pill tone="bad">Failed</Pill> <span className="text-[13px] text-bad">{r.error}</span>
                  </>
                )}
              </td>
              <td className="num">{r.rows}</td>
            </tr>
          ))}
        </Table>
      </Card>
    </Stack>
  );
}
