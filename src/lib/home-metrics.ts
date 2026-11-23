import { addDaysStr, fmtMD } from './dates';

export type MetricRow = { status: string; publish: string; views: number };

export function formatCount(n: number) {
  if (!Number.isFinite(n) || n <= 0) return '0';
  if (n >= 10000) {
    const man = n / 10000;
    const text = man >= 10 ? String(Math.round(man)) : man.toFixed(1).replace(/\.0$/, '');
    return `${text}万`;
  }
  return Math.round(n).toLocaleString('ja-JP');
}

export function monthDelta(current: number, previous: number) {
  if (current === 0 && previous === 0) return '0';
  if (previous <= 0) return `+${current} 前月比`;
  const pct = Math.round(((current - previous) / previous) * 100);
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct}% 前月比`;
}

function shiftMonth(ym: string, delta: number) {
  const [y, m] = ym.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function homeMetrics(rows: MetricRow[], today: string) {
  const published = rows.filter((r) => r.status === '公開');
  const month = today.slice(0, 7);
  const prev = shiftMonth(month, -1);
  const thisMonth = published.filter((r) => r.publish.startsWith(month)).length;
  const lastMonth = published.filter((r) => r.publish.startsWith(prev)).length;
  const views = rows.reduce((sum, row) => sum + (Number.isFinite(row.views) ? Math.max(0, row.views) : 0), 0);
  const days8 = Array.from({ length: 8 }, (_, i) => addDaysStr(today, i - 7));
  const days7 = Array.from({ length: 7 }, (_, i) => addDaysStr(today, i - 6));
  const zeros = days8.map(() => 0);
  return {
    videos: thisMonth,
    videoDelta: monthDelta(thisMonth, lastMonth),
    videoUp: thisMonth > lastMonth,
    videoSpark: days8.map((day) => published.filter((row) => row.publish === day).length),
    viewsLabel: formatCount(views),
    viewDelta: views === 0 ? '0' : '—',
    viewUp: false,
    viewSpark: views === 0 ? zeros : days8.map((day) => published.filter((row) => row.publish === day).reduce((sum, row) => sum + row.views, 0)),
    followersLabel: '0',
    engageLabel: '0%',
    zeroSpark: zeros,
    weekly: days7.map((day) => published.filter((row) => row.publish === day).length),
    weekLabels: days7.map((day) => fmtMD(day).replace(/\([^)]*\)/, '')),
  };
}
