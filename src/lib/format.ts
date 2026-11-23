export function yen(n: number) {
  return '¥' + Number(n || 0).toLocaleString('ja-JP');
}

export function initials(name: string) {
  const hasSpace = name.includes(' ');
  const n = name.replace(/\s/g, '').replace(/GIX/g, '');
  return n.slice(0, hasSpace ? 1 : 2) || 'G';
}

export function greetName(user: { name: string; role: string }) {
  if (user.role === 'ceo') return `${user.name}社長`;
  if (user.role === 'vp') return user.name;
  return `${user.name}さん`;
}

export const ROLE_LABEL: Record<string, string> = {
  ceo: '社長',
  vp: '副社長',
  manager: '部長',
  member: '一般',
  seconded: '出向者',
};

export function durLabel(mins: number) {
  const m = Math.max(0, Math.round(mins));
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}m`;
}
