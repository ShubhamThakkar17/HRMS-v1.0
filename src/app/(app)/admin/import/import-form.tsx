'use client';
import { useActionState } from 'react';
import { previewImportAction, runImportAction } from '@/server/actions/employees';
import type { ImportRow } from '@/server/services/import';
import { Status, Submit } from '@/components/forms';
import { formatINR } from '@/lib/money';

export function ImportForm() {
  const [preview, previewAction] = useActionState(previewImportAction, null);
  const [result, importAction] = useActionState(runImportAction, null);
  const data = preview?.ok ? (preview.data as { rows: ImportRow[]; csv: string }) : null;
  const errors = data?.rows.filter((r) => r.errors.length).length ?? 0;
  return (
    <div className="grid gap-4">
      <form action={previewAction} className="flex flex-wrap items-end gap-3">
        <label className="field">
          CSV file
          <input type="file" name="file" accept=".csv,text/csv" required />
        </label>
        <Submit pendingText="Checking…">Check file</Submit>
      </form>
      <Status state={preview} />
      {data ? (
        <>
          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>Line</th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Department</th>
                  <th>Join date</th>
                  <th>Mode</th>
                  <th>Office</th>
                  <th className="num">CTC</th>
                  <th>Roles</th>
                  <th>Problems</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.line} className={r.errors.length ? 'bg-bad-bg' : ''}>
                    <td>{r.line}</td>
                    <td>{r.name}</td>
                    <td>{r.email}</td>
                    <td>{r.dept}</td>
                    <td>{r.joinedOn}</td>
                    <td>{r.workMode}</td>
                    <td>{r.officeCode}</td>
                    <td className="num">{formatINR(r.ctcPaise)}</td>
                    <td>{r.roles.join(', ')}</td>
                    <td className="text-bad">{r.errors.join('; ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!errors ? (
            <form action={importAction} className="flex items-center gap-3">
              <input type="hidden" name="csv" value={data.csv} />
              <Submit pendingText="Importing…">Import {data.rows.length} people</Submit>
              <Status state={result} />
            </form>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
