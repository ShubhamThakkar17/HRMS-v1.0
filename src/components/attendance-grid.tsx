import type { CalendarDay } from '@/server/services/attendance';
import { eachDay, fmtShort, istTime, monthRange, weekdayIndex } from '@/lib/dates';
import { STATUS_LABEL, type DisplayCode } from '@/lib/attendance-rules';
import { summarise } from './attendance-table';

const CELL: Record<DisplayCode, string> = {
  PRESENT: 'bg-good-bg text-good',
  LATE: 'bg-warn-bg text-warn',
  SHORT: 'bg-warn-bg text-warn',
  LEAVE: 'bg-info-bg text-info',
  ABSENT: 'bg-bad-bg text-bad',
  PENDING: 'bg-[#eceeee] text-muted',
  WEEKEND: 'text-[#c0cac6]',
  HOLIDAY: 'text-[#c0cac6]',
  UPCOMING: 'text-[#d6ddda]',
  NOT_JOINED: 'text-[#d6ddda]',
};
const LETTER: Record<DisplayCode, string> = {
  PRESENT: 'P',
  LATE: 'L',
  SHORT: 'S',
  LEAVE: 'Lv',
  ABSENT: 'A',
  PENDING: '·',
  WEEKEND: '',
  HOLIDAY: 'H',
  UPCOMING: '',
  NOT_JOINED: '',
};

/** Month grid: one row per person, one cell per day. */
export function AttendanceGrid({
  ym,
  rows,
}: {
  ym: string;
  rows: { id: string; name: string; days: CalendarDay[] }[];
}) {
  const { from, to } = monthRange(ym);
  const dates = eachDay(from, to);
  if (!rows.length) return <p className="text-muted">No one to show.</p>;
  return (
    <div className="grid gap-3">
      <div className="overflow-x-auto">
        <table className="text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 bg-surface">Person</th>
              {dates.map((d) => (
                <th
                  key={d}
                  className={`!px-0.5 text-center ${[0, 6].includes(weekdayIndex(d)) ? 'opacity-50' : ''}`}
                >
                  {Number(d.slice(8))}
                </th>
              ))}
              <th className="num">P</th>
              <th className="num">L</th>
              <th className="num">A</th>
              <th className="num">Lv</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const s = summarise(r.days);
              return (
                <tr key={r.id}>
                  <td className="sticky left-0 bg-surface whitespace-nowrap">{r.name}</td>
                  {r.days.map((d) => (
                    <td key={d.date} className="!px-0.5 text-center">
                      <span
                        title={`${fmtShort(d.date)}: ${d.holidayName ?? STATUS_LABEL[d.status]}${d.firstIn ? ` · in ${istTime(d.firstIn)}` : ''}${d.lastOut ? ` · out ${istTime(d.lastOut)}` : ''}${d.flagged ? ' · outside office' : ''}`}
                        className={`inline-grid size-6 place-items-center rounded font-semibold ${CELL[d.status]} ${d.flagged ? 'ring-2 ring-bad' : ''}`}
                      >
                        {LETTER[d.status]}
                      </span>
                    </td>
                  ))}
                  <td className="num">{s.present + s.short}</td>
                  <td className="num">{s.late}</td>
                  <td className="num">{s.absent}</td>
                  <td className="num">{s.leave}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[13px] text-muted">
        P present · L late · S short day · A absent · Lv on leave · H holiday · red ring: punched outside the
        office
      </p>
    </div>
  );
}
