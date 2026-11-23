export const DOW = ['日', '月', '火', '水', '木', '金', '土'] as const;

export function tokyoParts(date = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const map: Record<string, string> = {};
  for (const p of fmt.formatToParts(date)) map[p.type] = p.value;
  let hour = map.hour || '00';
  if (hour === '24') hour = '00';
  return {
    year: map.year,
    month: map.month,
    day: map.day,
    hour,
    minute: map.minute,
  };
}

export function todayYMD(date = new Date()) {
  const p = tokyoParts(date);
  return `${p.year}-${p.month}-${p.day}`;
}

export function hmNow(date = new Date()) {
  const p = tokyoParts(date);
  return `${p.hour}:${p.minute}`;
}

export function addDaysStr(ymd: string, n: number) {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

export function utcDow(ymd: string) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function fmtMD(ymd: string) {
  const [, m, d] = ymd.split('-').map(Number);
  return `${m}/${d}(${DOW[utcDow(ymd)]})`;
}

export function timeAgo(iso: string, now = Date.now()) {
  const s = (now - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'たった今';
  if (s < 3600) return `${Math.floor(s / 60)}分前`;
  if (s < 86400) return `${Math.floor(s / 3600)}時間前`;
  return `${Math.floor(s / 86400)}日前`;
}

export function minutesToHM(mins: number) {
  const m = ((mins % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export function hmToMinutes(hm: string) {
  const [h, m] = hm.split(':').map(Number);
  return h * 60 + m;
}

export function greet(date = new Date()) {
  const h = Number(tokyoParts(date).hour);
  if (h < 11) return 'おはようございます';
  if (h < 18) return 'こんにちは';
  return 'おつかれさまです';
}
