'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { PLATFORMS, STAGES, STAGE_C } from '@/lib/constants';
import { api } from '@/lib/http';
import type { BaseRow } from '@/lib/types';
import { Icon } from '../icons';
import { useGix } from '../Shell';

const COLS: [keyof BaseRow, string][] = [['title', 'タイトル'], ['platform', '媒体'], ['status', 'ステータス'], ['ownerId', '担当'], ['publish', '公開予定日'], ['tag', 'タグ'], ['views', '再生数']];

export function BaseView() {
  const { members, member, me, toast } = useGix();
  const sp = useSearchParams();
  const [rows, setRows] = useState<BaseRow[]>([]);
  const [q, setQ] = useState(sp.get('q') || '');
  const [status, setStatus] = useState('all');
  const [group, setGroup] = useState(false);
  const [sort, setSort] = useState<[string, number] | null>(null);
  const load = useCallback(async () => setRows(await api<BaseRow[]>('/api/base')), []);
  useEffect(() => { load().catch(() => undefined); }, [load]);

  let view = rows.slice();
  const query = q.trim();
  if (query) view = view.filter((r) => [r.title, r.platform, r.tag, member(r.ownerId).name].join(' ').includes(query));
  if (status !== 'all') view = view.filter((r) => r.status === status);
  if (sort) {
    const [k, dir] = sort;
    view.sort((a, b) => {
      const av = k === 'status' ? STAGES.indexOf(a.status as typeof STAGES[number]) : k === 'ownerId' ? member(a.ownerId).name : (a as unknown as Record<string, string | number>)[k];
      const bv = k === 'status' ? STAGES.indexOf(b.status as typeof STAGES[number]) : k === 'ownerId' ? member(b.ownerId).name : (b as unknown as Record<string, string | number>)[k];
      return (av > bv ? 1 : av < bv ? -1 : 0) * dir;
    });
  }
  async function set(id: string, k: string, v: string | number) {
    await api('/api/base/' + id, { method: 'PATCH', body: JSON.stringify({ [k]: v }) });
    if (k === 'status') {
      await load();
      if (v === '公開') toast('公開ステータスになりました');
    } else {
      setRows((rs) => rs.map((r) => r.id === id ? { ...r, [k]: v } : r));
    }
  }
  function exportCSV() {
    const header = COLS.map((c) => c[1]).join(',');
    const lines = rows.map((r) => COLS.map(([k]) => `"${String(k === 'ownerId' ? member(r.ownerId).name : r[k]).replace(/"/g, '""')}"`).join(','));
    const blob = new Blob(['\ufeff' + [header, ...lines].join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'gix-pipeline.csv';
    a.click();
    toast('CSVを書き出しました');
  }
  async function add() {
    await api('/api/base', { method: 'POST' });
    setStatus('all'); setQ('');
    await load();
  }
  const total = rows.length || 1;
  const rowH = (r: BaseRow, i: number) => (
    <tr key={r.id}>
      <td className="faint small">{i + 1}</td>
      <td contentEditable suppressContentEditableWarning style={{ fontWeight: 600, minWidth: 220 }} onBlur={(e) => set(r.id, 'title', e.currentTarget.textContent?.trim() || '')}>{r.title}</td>
      <td><select className="in" style={{ width: 'auto', padding: '3px 8px' }} value={r.platform} onChange={(e) => set(r.id, 'platform', e.target.value)}>{PLATFORMS.map((p) => <option key={p}>{p}</option>)}</select></td>
      <td><select className="in" style={{ width: 'auto', padding: '3px 8px', borderColor: STAGE_C[r.status] + '66', color: STAGE_C[r.status], fontWeight: 700 }} value={r.status} onChange={(e) => set(r.id, 'status', e.target.value)}>{STAGES.map((s) => <option key={s}>{s}</option>)}</select></td>
      <td><select className="in" style={{ width: 'auto', padding: '3px 8px' }} value={r.ownerId} onChange={(e) => set(r.id, 'ownerId', e.target.value)}>{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></td>
      <td><input type="date" className="in" style={{ width: 'auto', padding: '3px 8px' }} value={r.publish} onChange={(e) => set(r.id, 'publish', e.target.value)} /></td>
      <td contentEditable suppressContentEditableWarning onBlur={(e) => set(r.id, 'tag', e.currentTarget.textContent?.trim() || '')}>{r.tag}</td>
      <td contentEditable suppressContentEditableWarning style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }} onBlur={(e) => set(r.id, 'views', Number(e.currentTarget.textContent?.replace(/[^0-9]/g, '')) || 0)}>{Number(r.views).toLocaleString()}</td>
      <td><span className="faint" style={{ cursor: 'pointer' }} onClick={async () => { await api('/api/base/' + r.id, { method: 'DELETE' }); load(); }}><Icon name="trash" style={{ width: 14 }} /></span></td>
    </tr>
  );
  return (
    <>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(5, 1fr)', marginBottom: 16 }}>
        {STAGES.map((s) => {
          const n = rows.filter((r) => r.status === s).length;
          return (
            <div key={s} className="card" style={{ padding: 14, cursor: 'pointer', borderColor: status === s ? STAGE_C[s] : undefined }} onClick={() => setStatus(status === s ? 'all' : s)}>
              <div className="small muted">{s}</div>
              <div style={{ fontSize: 28, fontWeight: 500, fontFamily: 'var(--serif)', margin: '2px 0 6px' }}>{n}</div>
              <div className="prog"><i style={{ width: `${(n / total) * 100}%`, background: STAGE_C[s] }} /></div>
            </div>
          );
        })}
      </div>
      <div className="toolbar">
        <b style={{ fontSize: 15 }}>動画制作パイプライン</b>
        <span className="badge b-m">{view.length}件</span>
        <div className="grow" />
        <input className="in" style={{ width: 280 }} placeholder="フィルター（タイトル・担当・タグ）" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="in" style={{ width: 'auto' }} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">全ステータス</option>
          {STAGES.map((s) => <option key={s}>{s}</option>)}
        </select>
        <button className={`btn ${group ? 'active' : ''}`} type="button" onClick={() => setGroup((v) => !v)}><Icon name="list" style={{ width: 15 }} /> ステータスでグループ化</button>
        <button className="btn" type="button" onClick={exportCSV}>CSV出力</button>
        <button className="btn primary" type="button" onClick={add}><Icon name="plus" /> 行を追加</button>
      </div>
      <div className="card" style={{ padding: 0, overflow: 'auto', maxHeight: 'calc(100vh - 290px)' }}>
        <table className="tbl">
          <thead>
            <tr>
              <th style={{ width: 36 }}>#</th>
              {COLS.map(([k, l]) => <th key={k} onClick={() => setSort(sort && sort[0] === k ? (sort[1] > 0 ? [k, -1] : null) : [k, 1])}>{l} {sort && sort[0] === k ? (sort[1] > 0 ? '▲' : '▼') : ''}</th>)}
              <th />
            </tr>
          </thead>
          <tbody>
            {group ? STAGES.map((s) => {
              const g = view.filter((r) => r.status === s);
              return [<tr key={s}><td colSpan={9} style={{ background: STAGE_C[s] + '18', fontWeight: 700 }}><span style={{ color: STAGE_C[s] }}>●</span> {s} <span className="badge b-m">{g.length}</span></td></tr>, ...g.map(rowH)];
            }) : view.map(rowH)}
          </tbody>
        </table>
      </div>
      <span style={{ display: 'none' }}>{me.id}</span>
    </>
  );
}
