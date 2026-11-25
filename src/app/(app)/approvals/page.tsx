import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { CalendarHeart, CheckCheck, ClipboardEdit, Paperclip, ReceiptText, Wallet } from 'lucide-react';
import { requireUser } from '@/server/current-user';
import { approvalsInbox } from '@/server/services/approvals';
import { decideAction, reimburseAction } from '@/server/actions/requests';
import { canSeeApprovals } from '@/lib/permissions';
import { fmtDate, fmtShort, fromDbDate } from '@/lib/dates';
import { formatINR } from '@/lib/money';
import { ActionButton, DecideButtons } from '@/components/forms';
import { Avatar, Empty, PageHead, Stack } from '@/components/ui';

export const metadata = { title: 'Approvals' };

function Request({
  name,
  dept,
  kind,
  icon,
  title,
  detail,
  note,
  actions,
}: {
  name: string;
  dept: string;
  kind: string;
  icon: ReactNode;
  title: ReactNode;
  detail?: ReactNode;
  note?: ReactNode;
  actions: ReactNode;
}) {
  return (
    <article className="card card-hover grid gap-4 !p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
      <div className="flex min-w-0 gap-3">
        <Avatar name={name} size={42} />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <strong>{name}</strong>
            <span className="text-muted">{dept}</span>
            <span className="chip bg-soft text-muted [&>svg]:size-3.5">
              {icon}
              {kind}
            </span>
          </div>
          <div className="mt-1 text-[15px] font-semibold">{title}</div>
          {detail ? <div className="text-sm text-muted">{detail}</div> : null}
          {note ? <div className="mt-1 text-sm">{note}</div> : null}
        </div>
      </div>
      <div className="md:justify-self-end">{actions}</div>
    </article>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  return (
    <section className="grid gap-3">
      <h2 className="flex items-center gap-2">
        {title}
        <span className={`chip ${count ? 'bg-brand text-white' : 'bg-soft text-muted'}`}>{count}</span>
      </h2>
      {children}
    </section>
  );
}

export default async function Approvals() {
  const user = await requireUser();
  if (!canSeeApprovals(user.permissions)) redirect('/');
  const inbox = await approvalsInbox(user);
  const scope = user.permissions.has('leave.approve_all') ? 'everyone' : 'your direct reports';
  const decides = user.permissions.has('approve.team') || user.permissions.has('leave.approve_all');
  return (
    <Stack>
      <PageHead
        title="Approvals"
        lead={`Requests from ${scope}. You never approve your own. Rejecting asks for a short reason.`}
      />
      {inbox.count === 0 ? (
        <div className="card">
          <Empty icon={<CheckCheck />}>All caught up. Nothing waits for you.</Empty>
        </div>
      ) : null}
      {decides && inbox.leaves.length ? (
        <Section title="Leave" count={inbox.leaves.length}>
          {inbox.leaves.map((l) => (
            <Request
              key={l.id}
              name={l.employee.name}
              dept={l.employee.dept}
              kind={l.type}
              icon={<CalendarHeart />}
              title={`${fmtShort(fromDbDate(l.from))}${l.from.getTime() !== l.to.getTime() ? ` – ${fmtDate(fromDbDate(l.to))}` : ''} · ${l.days} day${l.days === 1 ? '' : 's'}`}
              detail={l.code}
              note={l.reason}
              actions={<DecideButtons action={decideAction} kind="leave" id={l.id} />}
            />
          ))}
        </Section>
      ) : null}
      {decides && inbox.regs.length ? (
        <Section title="Attendance corrections" count={inbox.regs.length}>
          {inbox.regs.map((r) => (
            <Request
              key={r.id}
              name={r.employee.name}
              dept={r.employee.dept}
              kind="Correction"
              icon={<ClipboardEdit />}
              title={`${fmtDate(fromDbDate(r.date))} · ${r.inTime}–${r.outTime}`}
              detail={r.code}
              note={r.reason}
              actions={<DecideButtons action={decideAction} kind="reg" id={r.id} />}
            />
          ))}
        </Section>
      ) : null}
      {decides && inbox.expenses.length ? (
        <Section title="Expense claims" count={inbox.expenses.length}>
          {inbox.expenses.map((x) => (
            <Request
              key={x.id}
              name={x.employee.name}
              dept={x.employee.dept}
              kind={x.category}
              icon={<ReceiptText />}
              title={`${formatINR(x.amountPaise)} · ${fmtShort(fromDbDate(x.date))}`}
              detail={x.code}
              note={
                <>
                  {x.note}{' '}
                  {x.receiptKey ? (
                    <a
                      href={`/api/receipts/${x.id}`}
                      target="_blank"
                      rel="noopener"
                      className="ml-1 inline-flex items-center gap-1"
                    >
                      <Paperclip className="size-3.5" /> View receipt
                    </a>
                  ) : (
                    <span className="text-muted">· no receipt</span>
                  )}
                </>
              }
              actions={<DecideButtons action={decideAction} kind="expense" id={x.id} />}
            />
          ))}
        </Section>
      ) : null}
      {user.permissions.has('expense.pay') && inbox.toPay.length ? (
        <Section title="Approved claims to reimburse" count={inbox.toPay.length}>
          {inbox.toPay.map((x) => (
            <Request
              key={x.id}
              name={x.employee.name}
              dept={x.employee.dept}
              kind={x.category}
              icon={<Wallet />}
              title={`${formatINR(x.amountPaise)} · ${fmtShort(fromDbDate(x.date))}`}
              detail={x.code}
              note={
                <>
                  {x.note}{' '}
                  {x.receiptKey ? (
                    <a
                      href={`/api/receipts/${x.id}`}
                      target="_blank"
                      rel="noopener"
                      className="ml-1 inline-flex items-center gap-1"
                    >
                      <Paperclip className="size-3.5" /> View receipt
                    </a>
                  ) : null}
                </>
              }
              actions={
                <ActionButton action={reimburseAction} fields={{ id: x.id }} label="Mark reimbursed" />
              }
            />
          ))}
        </Section>
      ) : null}
    </Stack>
  );
}
