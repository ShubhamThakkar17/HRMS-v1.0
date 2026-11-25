import type { CalendarDay } from '@/server/services/attendance';
import { fmtShort, istTime, weekdayIndex } from '@/lib/dates';
import { STATUS_LABEL, type DisplayCode } from '@/lib/attendance-rules';

const CELL: Record<DisplayCode, string> = {
  PRESENT: 'bg-good-bg text-good border-transparent',
  LATE: 'bg-warn-bg text-warn border-transparent',
  SHORT: 'bg-warn-bg text-warn border-transparent',
  LEAVE: 'bg-info-bg text-info border-transparent',
  ABSENT: 'bg-bad-bg text-bad border-transparent',
  PENDING: 'bg-white text-ink border-brand border-2',
  WEEKEND: 'bg-surface-2 text-faint border-transparent',
  HOLIDAY: 'bg-[#f3eefc] text-[#6b46c1] border-transparent',
  UPCOMING: 'bg-white text-faint border-line border-dashed',
  NOT_JOINED: 'bg-surface-2 text-faint border-transparent',
};

export const LEGEND: { code: DisplayCode; label: string }[] = [
  { code: 'PRESENT', label: 'Present' },
  { code: 'LATE', label: 'Late / short' },
  { code: 'ABSENT', label: 'Absent' },
  { code: 'LEAVE', label: 'Leave' },
  { code: 'HOLIDAY', label: 'Holiday' },
];

/** Month calendar (Mon–Sun) with each day coloured by status. */
export function MonthCalendar({ days }: { days: CalendarDay[] }) {
  if (!days.length) return null;
  const lead = (weekdayIndex(days[0]!.date) + 6) % 7;
  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-7 gap-1.5 text-center text-[11px] font-semibold tracking-wide text-faint uppercase">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {Array.from({ length: lead }, (_, i) => (
          <div key={`pad${i}`} />
        ))}
        {days.map((d, i) => (
          <div
            key={d.date}
            title={`${fmtShort(d.date)}: ${d.holidayName ?? STATUS_LABEL[d.status]}${d.firstIn ? ` · in ${istTime(d.firstIn)}` : ''}${d.lastOut ? ` · out ${istTime(d.lastOut)}` : ''}${d.hours ? ` · ${d.hours} h` : ''}`}
            className={`anim-pop relative grid aspect-square min-h-11 content-between rounded-xl border p-1.5 text-left transition-transform hover:z-10 hover:scale-105 sm:aspect-[1.15] sm:p-2 ${CELL[d.status]} ${d.flagged ? 'ring-2 ring-bad/60' : ''}`}
            style={{ animationDelay: `${i * 14}ms` }}
          >
            <span className="text-[13px] leading-none font-semibold">{Number(d.date.slice(8))}</span>
            <span className="hidden truncate text-[11px] leading-tight opacity-80 sm:block">
              {d.firstIn
                ? istTime(d.firstIn)
                : d.status === 'HOLIDAY'
                  ? d.holidayName
                  : d.status === 'LEAVE'
                    ? 'Leave'
                    : d.status === 'ABSENT'
                      ? 'Absent'
                      : ''}
            </span>
            {d.firstIn ? (
              <span className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-current sm:hidden" />
            ) : null}
          </div>
        ))}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted">
        {LEGEND.map((l) => (
          <li key={l.code} className="flex items-center gap-1.5">
            <span className={`size-3 rounded ${CELL[l.code].split(' ')[0]}`} />
            {l.label}
          </li>
        ))}
        <li className="flex items-center gap-1.5">
          <span className="size-3 rounded ring-2 ring-bad/60" /> Outside work area
        </li>
      </ul>
    </div>
  );
}
