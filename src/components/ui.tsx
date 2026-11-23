'use client';

import { useEffect } from 'react';
import { initials } from '@/lib/format';
import type { Member } from '@/lib/types';
import { Icon } from './icons';

export function Avatar({ member, size }: { member: Member; size?: 'sm' | 'lg' }) {
  const bg = member.grad || member.deptColor || '#888';
  return (
    <span className={`av ${size || ''} ${member.status === 'online' ? 'on' : ''}`} title={member.name} style={{ background: bg }}>
      {member.isBot ? '✦' : initials(member.name)}
    </span>
  );
}

export function Prio({ p }: { p: string }) {
  const cls = p === '高' ? 'b-r' : p === '中' ? 'b-y' : 'b-m';
  return <span className={`badge ${cls}`}>{p}</span>;
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
    </div>
  );
}

export function Modal({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-label={title}>
        <div className="modal-h">
          {title}
          <button className="icon-btn" style={{ marginLeft: 'auto', width: 32, height: 32 }} onClick={onClose} type="button">
            <Icon name="x" />
          </button>
        </div>
        <div className="modal-b">{children}</div>
        {footer ? <div className="modal-f">{footer}</div> : null}
      </div>
    </div>
  );
}

export function Spark({ values, color = '#4452d6' }: { values: number[]; color?: string }) {
  const w = 200;
  const h = 46;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const pts = values.map((v, i) => [i * (w / (values.length - 1)), h - 4 - ((v - min) / (max - min || 1)) * (h - 8)]);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  const gid = `s${Math.random().toString(36).slice(2, 8)}`;
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.10" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${d} L${w} ${h} L0 ${h}Z`} fill={`url(#${gid})`} />
      <path d={d} fill="none" stroke={color} strokeWidth="1.6" />
    </svg>
  );
}

export function Ring({ pct, size = 84, label }: { pct: number; size?: number; label?: string }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const off = c * (1 - Math.min(pct, 100) / 100);
  return (
    <svg className="ring" viewBox="0 0 84 84" style={{ width: size, height: size }}>
      <circle cx="42" cy="42" r={r} fill="none" stroke="rgba(120,120,130,.14)" strokeWidth="5" />
      <circle cx="42" cy="42" r={r} fill="none" stroke="#4452d6" strokeWidth="5" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off} transform="rotate(-90 42 42)" />
      <text x="42" y="47" textAnchor="middle" fontSize="16" fill="currentColor">{label ?? `${Math.round(pct)}%`}</text>
    </svg>
  );
}

export function MessageText({ text, names }: { text: string; names: string[] }) {
  const dict = [...names, '全員'].sort((a, b) => b.length - a.length);
  const nodes: React.ReactNode[] = [];
  let i = 0;
  let plain = '';
  let k = 0;
  const flush = () => {
    if (!plain) return;
    nodes.push(<span key={k++}>{plain}</span>);
    plain = '';
  };
  while (i < text.length) {
    if (text[i] === '@') {
      const rest = text.slice(i + 1);
      const hit = dict.find((n) => rest.startsWith(n) || rest.startsWith(n.replace(/\s/g, '')));
      if (hit) {
        flush();
        const len = rest.startsWith(hit) ? hit.length : hit.replace(/\s/g, '').length;
        nodes.push(<span className="mention" key={k++}>@{hit}</span>);
        i += 1 + len;
        continue;
      }
    }
    plain += text[i++];
  }
  flush();
  return <>{nodes}</>;
}

export function memberOptions(members: Member[]) {
  return members.map((m) => (
    <option key={m.id} value={m.id}>
      {m.name}（{m.deptName}）
    </option>
  ));
}
