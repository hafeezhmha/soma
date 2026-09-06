import type { Part } from '@/lib/types';

export default function WeeklyHistory({ parts }: { parts: Part[] }) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const days = Array.from({ length: 7 }, (_, index) => { const date = new Date(today); date.setDate(date.getDate() - 6 + index); return date; });
  const records = parts.flatMap((part) => part.activationsList ?? []);
  const readings = days.map((day) => {
    const next = new Date(day); next.setDate(next.getDate() + 1);
    const matches = records.filter((item) => { const time = new Date(item.activated_at ?? item.date ?? '').getTime(); return time >= day.getTime() && time < next.getTime() && typeof item.intensity_after === 'number'; });
    return matches.length ? matches.reduce((sum, item) => sum + item.intensity_after!, 0) / matches.length : null;
  });
  return <section className="weekly-history" aria-label="Your past seven days"><p className="eyebrow">This week</p><h2>Your check-ins</h2><p className="caption">Sensation intensity after rechecking. Multiple check-ins are averaged per day; blank days have no saved reading.</p>
    {readings.every((value) => value === null) ? <p className="body-copy">Your week will take shape as you save check-ins.</p> : <><svg viewBox="0 0 320 150" role="img" aria-label="Daily recheck intensity from one to ten">{[1, 5, 10].map((value) => <g key={value}><line x1="25" x2="310" y1={130 - value * 11} y2={130 - value * 11} stroke="var(--line-quiet)" /><text x="3" y={134 - value * 11} fontSize="10" fill="var(--ink-quiet)">{value}</text></g>)}{readings.map((value, index) => value === null ? null : <circle key={index} cx={35 + index * 44} cy={130 - value * 11} r="4" fill="var(--accent)" />)}</svg><div className="week-days">{days.map((day, index) => <span key={day.toISOString()}>{day.toLocaleDateString('en', { weekday: 'short' })}<small>{readings[index]?.toFixed(1) ?? '—'}</small></span>)}</div></>}
    <p className="caption">These are your own ratings, not an assessment of regulation or shutdown.</p>
  </section>;
}
