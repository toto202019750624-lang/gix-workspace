'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/http';
import type { Okr } from '@/lib/types';
import { Icon } from '../icons';
import { useGix } from '../Shell';
import { Avatar, Field, Modal, Ring, memberOptions } from '../ui';

function pct(k: { current: number; target: number; inverse: boolean }) {
  if (!k.target) return 0;
  return k.inverse ? Math.min(100, (k.target / (k.current || k.target)) * 100) : Math.min(100, (k.current / k.target) * 100);
}

export function OkrView() {
  const { me, members, member, toast } = useGix();
  const [rows, setRows] = useState<Okr[]>([]);
  const [creating, setCreating] = useState(false);
  const load = useCallback(async () => setRows(await api<Okr[]>('/api/okrs')), []);
  useEffect(() => { load().catch(() => undefined); }, [load]);
  const scores = rows.map((o) => o.krs.reduce((s, k) => s + pct(k), 0) / (o.krs.length || 1));
  const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  async function update(okr: Okr, krId: string, current: number) {
    await api('/api/okrs/' + okr.id, { method: 'PATCH', body: JSON.stringify({ krs: [{ id: krId, current }] }) });
    load();
  }
  return (
    <>
      <div className="card hero" style={{ marginBottom: 16 }}>
        <div className="row" style={{ gap: 22, flexWrap: 'wrap' }}>
          <Ring pct={avg} size={110} />
          <div>
            <div className="eyebrow">FY2026 H2 ・ 全社OKR</div>
            <h2>AI×動画で、埼玉からSNSの常識を変える</h2>
            <p>Objective {rows.length}件 ・ Key Results {rows.reduce((s, o) => s + o.krs.length, 0)}件 ・ 平均達成率 {Math.round(avg)}%</p>
          </div>
          <button className="btn primary" style={{ marginLeft: 'auto' }} type="button" onClick={() => setCreating(true)}><Icon name="plus" /> 目標を追加</button>
        </div>
      </div>
      <div className="grid g2">
        {rows.map((o, oi) => {
          const can = me.id === o.ownerId || me.role === 'ceo' || me.role === 'vp';
          return (
            <div className="card" key={o.id}>
              <div className="row" style={{ alignItems: 'flex-start' }}>
                <Ring pct={scores[oi]} size={64} />
                <div style={{ flex: 1 }}>
                  <div className="small muted row"><Avatar member={member(o.ownerId)} size="sm" /> {member(o.ownerId).name}</div>
                  <div style={{ fontWeight: 800, fontSize: 15, marginTop: 4 }}>{o.objective}</div>
                </div>
              </div>
              <div style={{ marginTop: 12 }}>
                {o.krs.map((k, ki) => (
                  <div key={k.id} style={{ marginBottom: 12 }}>
                    <div className="row small"><span>KR{ki + 1}. {k.title}</span><span style={{ marginLeft: 'auto' }} className="muted">{k.current} / {k.target}</span></div>
                    <div className="row" style={{ marginTop: 5 }}>
                      <div className="prog" style={{ flex: 1, height: 8 }}><i style={{ width: `${pct(k)}%` }} /></div>
                      <input type="number" step="any" className="in" style={{ width: 80, padding: '3px 6px' }} defaultValue={k.current} disabled={!can} onBlur={(e) => update(o, k.id, Number(e.target.value))} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      {creating ? <NewOkr members={members} meId={me.id} onClose={() => setCreating(false)} onCreate={async (body) => { await api('/api/okrs', { method: 'POST', body: JSON.stringify(body) }); setCreating(false); toast('目標を追加しました'); load(); }} /> : null}
    </>
  );
}

function NewOkr({ members, meId, onClose, onCreate }: { members: Parameters<typeof memberOptions>[0]; meId: string; onClose: () => void; onCreate: (b: { objective: string; ownerId: string; krs: { title: string; target: number }[] }) => void }) {
  const [objective, setObjective] = useState('');
  const [ownerId, setOwnerId] = useState(meId);
  const [text, setText] = useState('');
  return (
    <Modal title="目標（Objective）を追加" onClose={onClose} footer={<><button className="btn" type="button" onClick={onClose}>キャンセル</button><button className="btn primary" type="button" onClick={() => {
      if (!objective.trim()) return;
      const krs = text.split('\n').filter((l) => l.trim()).map((l) => { const [t, tg] = l.split(/[,，]/); return { title: t.trim(), target: Number(tg) || 100 }; });
      onCreate({ objective, ownerId, krs });
    }}>追加</button></>}>
      <Field label="Objective"><input className="in" value={objective} onChange={(e) => setObjective(e.target.value)} /></Field>
      <Field label="オーナー"><select className="in" value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>{memberOptions(members)}</select></Field>
      <Field label="Key Results（1行に1つ「内容, 目標値」）"><textarea className="in" rows={4} placeholder={'月間再生 1000万回, 1000\n新規取引 5社, 5'} value={text} onChange={(e) => setText(e.target.value)} /></Field>
    </Modal>
  );
}
