import { redirect } from 'next/navigation';
import { requireUser } from '@/server/current-user';
import { getSetting } from '@/server/settings';
import { linkSheetAction } from '@/server/actions/company';
import { TABS } from '@/server/services/sheets';
import { fmtDateTime } from '@/lib/dates';
import { ActionForm, Submit } from '@/components/forms';
import { Card, PageHead, Pill, Stack, Table } from '@/components/ui';
import { SyncNow } from './sync-now';

export const metadata = { title: 'Google Sheets sync' };

export default async function SyncPage() {
  const user = await requireUser();
  if (!user.permissions.has('sheets.sync')) redirect('/');
  const cfg = await getSetting('sheets');
  const configured = !!(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY);
  return (
    <Stack>
      <PageHead
        title="Google Sheets sync"
        lead="A backup copy of every table, one tab each. Runs nightly; you can also sync now. Face templates and secrets are never exported."
      />
      <Card title="Linked sheet">
        <ActionForm action={linkSheetAction} reset={false} className="flex flex-wrap items-end gap-3">
          <label className="field min-w-72 flex-1">
            Sheet link or ID
            <input
              name="sheet"
              defaultValue={cfg.sheetId ? `https://docs.google.com/spreadsheets/d/${cfg.sheetId}/edit` : ''}
              required
            />
          </label>
          <Submit>Link sheet</Submit>
        </ActionForm>
        <p className="mt-2 text-[13px] text-muted">
          Service account:{' '}
          {configured ? (
            <span className="font-mono">{process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL}</span>
          ) : (
            <Pill tone="warn">not configured</Pill>
          )}
          . Share the sheet with it as an editor.
          {cfg.sheetId ? (
            <>
              {' '}
              ·{' '}
              <a
                href={`https://docs.google.com/spreadsheets/d/${cfg.sheetId}/edit`}
                target="_blank"
                rel="noopener"
              >
                Open sheet
              </a>
            </>
          ) : null}
        </p>
      </Card>
      <Card title="Sync now">
        <SyncNow disabled={!configured || !cfg.sheetId} />
      </Card>
      <Card
        title="Last sync"
        extra={
          cfg.lastSyncAt ? (
            <span className="text-[13px] text-muted">
              {fmtDateTime(new Date(cfg.lastSyncAt))} by {cfg.lastSyncBy}
            </span>
          ) : null
        }
      >
        <Table
          rows={cfg.lastResults.length ? cfg.lastResults.length : TABS.length}
          head={['Tab', 'Result', '#Rows']}
        >
          {(cfg.lastResults.length
            ? cfg.lastResults
            : TABS.map((t) => ({ tab: t.name, ok: true, rows: 0, error: 'not synced yet' }))
          ).map((r) => (
            <tr key={r.tab}>
              <td>{r.tab}</td>
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
