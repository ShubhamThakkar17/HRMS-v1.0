import { redirect } from 'next/navigation';
import { requireUser } from '@/server/current-user';
import { IMPORT_COLUMNS } from '@/server/services/import';
import { Card, PageHead, Stack } from '@/components/ui';
import { ImportForm } from './import-form';

export const metadata = { title: 'Import employees' };

export default async function ImportPage() {
  const user = await requireUser();
  if (!user.permissions.has('emp.edit')) redirect('/');
  return (
    <Stack>
      <PageHead
        title="Import employees"
        lead="Upload a CSV. Every row is checked and errors are shown before anything is imported."
        actions={
          <a className="btn btn-ghost" href="/api/import-template">
            Download template
          </a>
        }
      />
      <Card title="Columns">
        <p className="font-mono text-[13px] [overflow-wrap:anywhere]">{IMPORT_COLUMNS.join(', ')}</p>
        <p className="mt-2 text-[13px] text-muted">
          joined_on as YYYY-MM-DD · work_mode OFFICE, HYBRID or REMOTE · office_code from Settings · roles
          separated by ; (Employee is always added) · manager_email may be someone in the same file.
        </p>
      </Card>
      <Card title="Upload">
        <ImportForm />
      </Card>
    </Stack>
  );
}
