import { fromDbDate } from '@/lib/dates';
import { ActionForm, Submit, type Action } from './forms';

export interface EmployeeFormValues {
  id?: string;
  name: string;
  email: string;
  phone: string | null;
  dept: string;
  title: string;
  managerId: string | null;
  joinedOn: Date | null;
  workMode: string;
  officeId: string | null;
  ctcPaise: number;
}

export function EmployeeForm({
  action,
  values,
  managers,
  offices,
  depts,
  roles,
  submit,
}: {
  action: Action;
  values?: EmployeeFormValues;
  managers: { id: string; name: string; code: string }[];
  offices: { id: string; name: string }[];
  depts: string[];
  roles?: { id: string; name: string }[];
  submit: string;
}) {
  const v = values;
  return (
    <ActionForm
      action={action}
      reset={!v}
      className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3.5"
    >
      {v?.id ? <input type="hidden" name="id" value={v.id} /> : null}
      <label className="field">
        Full name
        <input name="name" defaultValue={v?.name} required minLength={2} />
      </label>
      <label className="field">
        Work email
        <input name="email" type="email" defaultValue={v?.email} required />
      </label>
      <label className="field">
        Phone
        <input name="phone" defaultValue={v?.phone ?? ''} />
      </label>
      <label className="field">
        Department
        <input name="dept" list="depts" defaultValue={v?.dept} required />
        <datalist id="depts">
          {depts.map((d) => (
            <option key={d} value={d} />
          ))}
        </datalist>
      </label>
      <label className="field">
        Designation
        <input name="title" defaultValue={v?.title} required />
      </label>
      <label className="field">
        Manager
        <select name="managerId" defaultValue={v?.managerId ?? ''}>
          <option value="">No manager</option>
          {managers
            .filter((m) => m.id !== v?.id)
            .map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} ({m.code})
              </option>
            ))}
        </select>
      </label>
      <label className="field">
        Join date
        <input
          type="date"
          name="joinedOn"
          defaultValue={v?.joinedOn ? fromDbDate(v.joinedOn) : ''}
          required
        />
      </label>
      <label className="field">
        Work mode
        <select name="workMode" defaultValue={v?.workMode ?? 'OFFICE'}>
          <option value="OFFICE">Office-based</option>
          <option value="HYBRID">Hybrid</option>
          <option value="REMOTE">Remote or field</option>
        </select>
      </label>
      <label className="field">
        Office
        <select name="officeId" defaultValue={v?.officeId ?? ''}>
          <option value="">None</option>
          {offices.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        Annual CTC (₹)
        <input
          name="ctcRupees"
          type="number"
          min={0}
          step={1}
          defaultValue={v ? v.ctcPaise / 100 : ''}
          required
        />
      </label>
      {roles?.length ? (
        <fieldset className="col-span-full flex flex-wrap gap-x-4.5 gap-y-2 rounded-lg border border-line px-3.5 py-2.5">
          <legend className="px-1 text-[13px] text-muted">Roles (Employee is always added)</legend>
          {roles
            .filter((r) => r.name !== 'Employee')
            .map((r) => (
              <label key={r.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="roleIds" value={r.id} /> {r.name}
              </label>
            ))}
        </fieldset>
      ) : null}
      <div className="col-span-full">
        <Submit>{submit}</Submit>
      </div>
    </ActionForm>
  );
}
