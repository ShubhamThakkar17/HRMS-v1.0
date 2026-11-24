import type { CalendarDay } from '@/server/services/attendance';
import { fmtShort, fmtWeekday, istTime } from '@/lib/dates';
import { fmtDistance } from '@/lib/geo';
import { METHOD_LABEL } from '@/lib/attendance-rules';
import { DayPill, Pill, Table } from './ui';

export function whereLabel(
  d: Pick<CalendarDay, 'officeId' | 'remote' | 'flagged' | 'distanceM' | 'inMethod'>,
  offices: Map<string, string>,
) {
  if (!d.inMethod) return null;
  if (d.officeId)
    return `${offices.get(d.officeId) ?? 'Office'}${d.distanceM ? ` · ${fmtDistance(d.distanceM)}` : ''}`;
  if (d.inMethod === 'WEB') return 'No location';
  if (d.inMethod === 'HR' || d.inMethod === 'REGULARISED') return 'Not recorded';
  return `${d.flagged ? 'Outside office' : 'Remote'}${d.distanceM != null ? ` · ${fmtDistance(d.distanceM)} from office` : ''}`;
}

export function AttendanceTable({
  days,
  offices,
  showFace = false,
}: {
  days: CalendarDay[];
  offices: Map<string, string>;
  showFace?: boolean;
}) {
  return (
    <Table
      rows={days.length}
      head={['Date', 'Status', 'In', 'Out', '#Hours', 'Method', 'Where', ...(showFace ? ['#Face'] : [])]}
    >
      {days.map((d) => (
        <tr
          key={d.date}
          className={['WEEKEND', 'UPCOMING', 'NOT_JOINED'].includes(d.status) ? 'text-muted' : ''}
        >
          <td className="whitespace-nowrap">
            <span className="inline-block w-9 text-muted">{fmtWeekday(d.date)}</span>
            {fmtShort(d.date)}
          </td>
          <td>
            <DayPill status={d.status} label={d.status === 'HOLIDAY' ? d.holidayName : undefined} />
          </td>
          <td className="font-mono">{d.firstIn ? istTime(d.firstIn) : ''}</td>
          <td className="font-mono">{d.lastOut ? istTime(d.lastOut) : ''}</td>
          <td className="num">{d.hours ?? ''}</td>
          <td>
            {d.inMethod ? METHOD_LABEL[d.inMethod] : ''}
            {d.outMethod && d.outMethod !== d.inMethod ? ` / ${METHOD_LABEL[d.outMethod]}` : ''}
          </td>
          <td>
            {whereLabel(d, offices)} {d.flagged ? <Pill tone="bad">Flagged</Pill> : null}
          </td>
          {showFace ? <td className="num">{d.faceScore ?? ''}</td> : null}
        </tr>
      ))}
    </Table>
  );
}

export function summarise(days: CalendarDay[]) {
  const c = { present: 0, late: 0, short: 0, absent: 0, leave: 0, hours: 0 };
  for (const d of days) {
    if (d.status === 'PRESENT') c.present++;
    if (d.status === 'LATE') c.late++;
    if (d.status === 'SHORT') c.short++;
    if (d.status === 'ABSENT') c.absent++;
    if (d.status === 'LEAVE') c.leave++;
    c.hours += d.hours ?? 0;
  }
  return { ...c, hours: Math.round(c.hours * 10) / 10 };
}
