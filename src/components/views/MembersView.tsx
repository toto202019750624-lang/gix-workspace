'use client';

import { useState } from 'react';
import { useGix } from '../Shell';
import { Avatar } from '../ui';
import { Icon } from '../icons';

const STATUS: Record<string, [string, string]> = { online: ['オンライン', 'b-g'], away: ['離席', 'b-y'], busy: ['取込中', 'b-r'], offline: ['オフライン', 'b-m'] };

export function MembersView() {
  const { members, openProfile } = useGix();
  const [filter, setFilter] = useState('all');
  const depts = [
    { id: 'exec', name: '経営' },
    { id: 'plan', name: '企画部' },
    { id: 'prod', name: '制作部' },
    { id: 'sns', name: 'SNSマーケティング部' },
    { id: 'ai', name: 'AI・テック部' },
    { id: 'admin', name: '管理部' },
  ];
  const orgDepts = [
    { id: 'plan', name: '企画部', color: '#c48a9c' },
    { id: 'prod', name: '制作部', color: '#4a90a4' },
    { id: 'codex', name: '制作部（Codex出向）', color: '#6b93b8' },
    { id: 'sns', name: 'SNSマーケティング部', color: '#c39a3e' },
    { id: 'ai', name: 'AI・テック部', color: '#5e9c7e' },
    { id: 'admin', name: '管理部', color: '#c27a52' },
  ];
  const list = members.filter((m) => filter === 'all' || m.deptId === filter || (filter === 'prod' && m.deptId === 'codex'));
  const chima = members.find((m) => m.id === 'chima');
  const vp = members.find((m) => m.id === 'vp');
  return (
    <>
      <div className="toolbar">
        <div className="seg">
          <button className={filter === 'all' ? 'on' : ''} type="button" onClick={() => setFilter('all')}>全員</button>
          {depts.map((d) => <button key={d.id} className={filter === d.id ? 'on' : ''} type="button" onClick={() => setFilter(d.id)}>{d.name}</button>)}
        </div>
        <div className="grow" />
        <span className="muted small">社員16名＋Codex出向3名＋経営2名</span>
      </div>
      <div className="card" style={{ marginBottom: 16 }}>
        <h3><Icon name="users" /> 組織図</h3>
        <div className="org">
          {chima ? <OrgNode m={chima} top onClick={() => openProfile(chima.id)} /> : null}
          <div className="org-line" />
          {vp ? <OrgNode m={vp} top onClick={() => openProfile(vp.id)} /> : null}
          <div className="org-line" />
          <div className="org-depts">
            {orgDepts.map((d) => {
              const ms = members.filter((m) => m.deptId === d.id);
              const head = ms[0];
              return (
                <div className="org-dept" key={d.id}>
                  <div className="org-node" style={{ borderTop: `3px solid ${d.color}` }}>
                    <div style={{ fontWeight: 700, color: d.color }}>{d.name}</div>
                    <div className="small muted">{ms.length}名</div>
                    <div className="org-mem">
                      {ms.map((m) => <div key={m.id} style={{ cursor: 'pointer' }} onClick={() => openProfile(m.id)}>{m.name}{m === head && d.id !== 'codex' ? ' 👑' : ''}</div>)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div className="grid g4">
        {list.map((m) => (
          <div className="card" key={m.id} style={{ cursor: 'pointer', textAlign: 'center' }} onClick={() => openProfile(m.id)}>
            <Avatar member={m} size="lg" />
            <div style={{ fontWeight: 700, marginTop: 8 }}>{m.name}</div>
            <div className="small muted">{m.title}</div>
            <div className="row" style={{ justifyContent: 'center', marginTop: 8, flexWrap: 'wrap' }}>
              <span className="badge" style={{ background: m.deptColor + '26', color: m.deptColor }}>{m.deptName}</span>
              <span className={`badge ${STATUS[m.status]?.[1] || 'b-m'}`}>{STATUS[m.status]?.[0] || m.status}</span>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function OrgNode({ m, top, onClick }: { m: { id: string; name: string; title: string; grad: string | null; deptColor: string; status: string; isBot: boolean; email: string; deptId: string; deptName: string; role: string; roleLabel: string; skills: string[]; bio: string; ext: string; theme: string; sidebarCollapsed: boolean }; top?: boolean; onClick: () => void }) {
  return (
    <div className={`org-node ${top ? 'top' : ''}`} onClick={onClick}>
      <Avatar member={m} />
      <div style={{ fontWeight: 700, marginTop: 4 }}>{m.name}</div>
      <div className="small muted">{m.title}</div>
    </div>
  );
}
