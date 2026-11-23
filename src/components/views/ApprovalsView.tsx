'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { fmtMD } from '@/lib/dates';
import { yen } from '@/lib/format';
import { api } from '@/lib/http';
import type { Approval } from '@/lib/types';
import { useGix } from '../Shell';
import { Avatar, Field, Modal, memberOptions } from '../ui';

const ST: Record<string, [string, string]> = { pending: ['承認待ち', 'b-y'], approved: ['承認済み', 'b-g'], rejected: ['却下', 'b-r'] };
const STEP: Record<string, string> = { approved: '承認済', pending: '承認待ち', waiting: '未到達', rejected: '却下' };

export function ApprovalsView() {
  const { me, members, member, toast, refresh } = useGix();
  const sp = useSearchParams();
  const [tab, setTab] = useState(sp.get('tab') || 'pending');
  const [rows, setRows] = useState<Approval[]>([]);
  const [allCount, setAllCount] = useState({ pending: 0, month: 0, approved: 0, amount: 0 });
  const [creating, setCreating] = useState<string | null>(sp.get('new'));
  const load = useCallback(async () => {
    const [list, all] = await Promise.all([
      api<Approval[]>('/api/approvals?tab=' + tab),
      api<Approval[]>('/api/approvals?tab=all'),
    ]);
    setRows(list);
    const minePending = all.filter((a) => a.status === 'pending' && a.currentApproverId === me.id);
    setAllCount({
      pending: minePending.length,
      month: all.length,
      approved: all.filter((a) => a.status === 'approved').length,
      amount: all.filter((a) => a.status !== 'rejected').reduce((s, a) => s + a.amount, 0),
    });
  }, [tab, me.id]);
  useEffect(() => { load().catch(() => undefined); }, [load]);
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (d?.type === 'approval' || d?.type === 'poll') load().catch(() => undefined);
    };
    window.addEventListener('gix-rt', on);
    return () => window.removeEventListener('gix-rt', on);
  }, [load]);
  useEffect(() => { if (sp.get('tab')) setTab(sp.get('tab') || 'pending'); if (sp.get('new')) setCreating(sp.get('new')); }, [sp]);

  async function decide(id: string, decision: 'approved' | 'rejected') {
    const res = await api<Approval>(`/api/approvals/${id}/decide`, { method: 'POST', body: JSON.stringify({ decision }) });
    toast(res.status === 'pending' ? '次の承認者へ回しました' : `「${res.title}」を${decision === 'approved' ? '承認' : '却下'}しました`);
    await Promise.all([load(), refresh()]);
  }

  return (
    <>
      <div className="grid g4" style={{ marginBottom: 16 }}>
        {[['承認待ち（自分）', String(allCount.pending)], ['見える申請', String(allCount.month)], ['承認済み', String(allCount.approved)], ['申請総額', yen(allCount.amount)]].map(([l, n]) => (
          <div className="card kpi" key={l}><div className="lbl">{l}</div><div className="num">{n}</div></div>
        ))}
      </div>
      <div className="toolbar">
        <div className="seg">
          {([['pending', '承認待ち'], ['done', '処理済み'], ['mine', '自分の申請'], ['all', 'すべて']] as const).map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} type="button" onClick={() => setTab(k)}>{l}</button>)}
        </div>
        <div className="grow" />
        {['経費', '稟議', '休暇'].map((t) => <button key={t} className="btn" type="button" onClick={() => setCreating(t)}>{t === '経費' ? '💴' : t === '稟議' ? '📝' : '🌴'} {t}申請</button>)}
      </div>
      <div className="grid">
        {rows.length ? rows.map((a) => <ApprovalCard key={a.id} a={a} meId={me.id} onDecide={decide} />) : <div className="card empty">該当する申請はありません</div>}
      </div>
      {creating ? <NewApproval type={creating} members={members} meId={me.id} onClose={() => setCreating(null)} onDone={async (approverIsMe) => { setCreating(null); setTab(approverIsMe ? 'pending' : 'mine'); toast('申請を送信しました'); await Promise.all([load(), refresh()]); }} /> : null}
    </>
  );
}

function ApprovalCard({ a, meId, onDecide }: { a: Approval; meId: string; onDecide: (id: string, d: 'approved' | 'rejected') => void }) {
  const { member } = useGix();
  const icon = a.type === '経費' ? '💴' : a.type === '稟議' ? '📝' : '🌴';
  const can = a.status === 'pending' && a.currentApproverId === meId;
  return (
    <div className="card" style={{ padding: 16 }}>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <span style={{ fontSize: 22 }}>{icon}</span>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div className="row"><b>{a.title}</b>{a.viaAi ? <span className="badge">AI</span> : null}<span className={`badge ${ST[a.status]?.[1] || 'b-m'}`}>{ST[a.status]?.[0] || a.status}</span><span className="badge b-m">{a.type}</span></div>
          <div className="small muted" style={{ marginTop: 3 }}>申請者 {member(a.requesterId).name} ・ {fmtMD(a.date)}{a.amount ? <> ・ <b style={{ color: 'var(--text)' }}>{yen(a.amount)}</b></> : null}{a.note ? ` ・ ${a.note}` : ''}</div>
          <div className="row small" style={{ marginTop: 10, gap: 6, flexWrap: 'wrap' }}>
            <span className="row" style={{ gap: 5 }}><Avatar member={member(a.requesterId)} size="sm" /><span className="muted">{member(a.requesterId).name}</span><span className="faint">申請</span></span>
            {a.steps.map((s, i) => (
              <span key={s.id} className="row" style={{ gap: 5 }}>
                <span className="faint">→</span>
                <Avatar member={member(s.approverId)} size="sm" />
                <span className={s.status === 'pending' ? 'step-now' : 'muted'}>{member(s.approverId).name}</span>
                <span className={`badge ${s.status === 'approved' ? 'b-g' : s.status === 'rejected' ? 'b-r' : s.status === 'pending' ? 'b-y' : 'b-m'}`}>{STEP[s.status]}</span>
                {i < 0 ? null : null}
              </span>
            ))}
          </div>
        </div>
        {can ? <div className="row"><button className="btn ng" type="button" onClick={() => onDecide(a.id, 'rejected')}>却下</button><button className="btn ok" type="button" onClick={() => onDecide(a.id, 'approved')}>✓ 承認</button></div> : null}
      </div>
    </div>
  );
}

function NewApproval({ type, members, meId, onClose, onDone }: { type: string; members: Parameters<typeof memberOptions>[0]; meId: string; onClose: () => void; onDone: (mine: boolean) => void }) {
  const manager = members.find((m) => m.role === 'manager' && (m.deptId === members.find((x) => x.id === meId)?.deptId || (members.find((x) => x.id === meId)?.deptId === 'codex' && m.deptId === 'prod')));
  const first = manager && manager.id !== meId ? manager.id : (members.find((m) => m.id === 'chima' && m.id !== meId)?.id || members.find((m) => m.id !== meId)?.id || '');
  const [kind, setKind] = useState(type);
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState(0);
  const [note, setNote] = useState('');
  const [approvers, setApprovers] = useState<string[]>(first ? [first] : []);
  const [add, setAdd] = useState(first);
  return (
    <Modal title={`${kind}申請を作成`} onClose={onClose} footer={<><button className="btn" type="button" onClick={onClose}>キャンセル</button><button className="btn primary" type="button" onClick={async () => {
      if (!title.trim() || !approvers.length) return;
      await api('/api/approvals', { method: 'POST', body: JSON.stringify({ type: kind, title, amount, note, approverIds: approvers }) });
      onDone(approvers[0] === meId);
    }}>申請する</button></>}>
      <Field label="種類"><select className="in" value={kind} onChange={(e) => setKind(e.target.value)}>{['経費', '稟議', '休暇'].map((t) => <option key={t}>{t}</option>)}</select></Field>
      <Field label="件名"><input className="in" value={title} placeholder="例: ロケ交通費" onChange={(e) => setTitle(e.target.value)} /></Field>
      <div className="grid g2">
        <Field label="金額（円）"><input className="in" type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value) || 0)} /></Field>
        <Field label="承認者を追加"><div className="row"><select className="in" value={add} onChange={(e) => setAdd(e.target.value)}>{memberOptions(members.filter((m) => m.id !== meId))}</select><button className="btn sm" type="button" onClick={() => { if (add && !approvers.includes(add)) setApprovers([...approvers, add]); }}>追加</button></div></Field>
      </div>
      <Field label="承認ルート（上から順に回ります）">
        <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
          {approvers.map((id, i) => <span key={id} className="badge">{i + 1}. {members.find((m) => m.id === id)?.name}<span style={{ marginLeft: 6, cursor: 'pointer' }} onClick={() => setApprovers(approvers.filter((x) => x !== id))}>×</span></span>)}
          {!approvers.length ? <span className="faint small">承認者を追加してください</span> : null}
        </div>
      </Field>
      <Field label="理由・備考"><textarea className="in" rows={3} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
    </Modal>
  );
}
