'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { fmtMD, todayYMD, addDaysStr } from '@/lib/dates';
import { api } from '@/lib/http';
import { md } from '@/lib/markdown';
import type { Meeting } from '@/lib/types';
import { Icon } from '../icons';
import { useGix } from '../Shell';
import { Avatar, Field, Modal } from '../ui';

export function MeetingsView() {
  const { me, members, member, toast } = useGix();
  const [rows, setRows] = useState<Meeting[]>([]);
  const [id, setId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [join, setJoin] = useState<Meeting | null>(null);
  const dirty = useRef(false);
  const [minutes, setMinutes] = useState('');
  const load = useCallback(async () => setRows(await api<Meeting[]>('/api/meetings')), []);
  useEffect(() => { load().catch(() => undefined); }, [load]);
  const sorted = rows.slice().sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
  const cur = rows.find((m) => m.id === id) || sorted[0];
  useEffect(() => {
    if (!cur) return;
    dirty.current = false;
    setMinutes(cur.minutes);
    if (!id) setId(cur.id);
  }, [cur?.id]);
  useEffect(() => {
    if (!cur || !dirty.current) return;
    const t = setTimeout(() => { api('/api/meetings/' + cur.id, { method: 'PATCH', body: JSON.stringify({ minutes }) }).catch(() => undefined); }, 500);
    return () => clearTimeout(t);
  }, [minutes]);

  async function toggle() {
    if (!cur) return;
    await api('/api/meetings/' + cur.id, { method: 'PATCH', body: JSON.stringify({ status: cur.status === 'done' ? 'upcoming' : 'done' }) });
    load();
  }
  function template() {
    if (!cur) return;
    const tpl = `# 議事録：${cur.title}\n\n- 日時：${cur.date} ${cur.time}\n- 参加者：${cur.attendees.map((a) => member(a).name).join('、')}\n\n## アジェンダ\n1. \n\n## 決定事項\n- \n\n## ToDo\n- [ ] 担当： 期限：\n\n## 次回\n- \n`;
    dirty.current = true;
    setMinutes(tpl + (minutes ? '\n' + minutes : ''));
  }
  function aiMinutes() {
    if (!cur) return;
    dirty.current = true;
    setMinutes(`# 議事録：${cur.title}（AI生成ドラフト）\n\n- 日時：${cur.date} ${cur.time}\n- 参加者：${cur.attendees.map((a) => member(a).name).join('、')}\n\n## 要点\n- 現在の進捗は概ね計画通り\n- 年末特番に向けて制作リソースを優先配分\n\n## 決定事項\n- 次回までに各担当がドラフトを共有\n\n## ToDo\n${cur.attendees.slice(0, 3).map((a) => `- [ ] ${member(a).name}：担当分のアクションを整理`).join('\n')}\n\n> ✦ GIX AI がサンプルとして生成した下書きです`);
    toast('AI議事録ドラフトを作成しました');
  }

  if (!cur) return <div className="empty">会議がありません</div>;
  return (
    <>
      <div className="grid" style={{ gridTemplateColumns: '340px 1fr' }}>
        <div className="grid" style={{ alignContent: 'start' }}>
          <button className="btn primary" type="button" onClick={() => setCreating(true)}><Icon name="plus" /> 会議を作成</button>
          {sorted.map((m) => (
            <div key={m.id} className="card" style={{ padding: 14, cursor: 'pointer', borderColor: m.id === cur.id ? 'var(--text)' : undefined, boxShadow: m.id === cur.id ? '0 0 0 1px var(--text)' : undefined }} onClick={() => setId(m.id)}>
              <div className="row"><b>{m.title}</b><span className={`badge ${m.status === 'done' ? 'b-g' : 'b-c'}`} style={{ marginLeft: 'auto' }}>{m.status === 'done' ? '終了' : '予定'}</span></div>
              <div className="small muted" style={{ margin: '4px 0 8px' }}>{fmtMD(m.date)} {m.time}</div>
              <div className="avs">{m.attendees.slice(0, 6).map((a) => <Avatar key={a} member={member(a)} size="sm" />)}</div>
            </div>
          ))}
        </div>
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0, fontSize: 19 }}>{cur.title}</h2>
            <span className="muted">{fmtMD(cur.date)} {cur.time}</span>
            <div className="grow" style={{ flex: 1 }} />
            <button className="btn" type="button" onClick={() => setJoin(cur)}><Icon name="meet" style={{ width: 15 }} /> 参加する</button>
            <button className="btn" type="button" onClick={template}>テンプレート挿入</button>
            <button className="btn" type="button" onClick={aiMinutes}><Icon name="spark" style={{ width: 15 }} /> AI議事録</button>
            <button className={`btn ${cur.status === 'done' ? 'ok' : ''}`} type="button" onClick={toggle}>{cur.status === 'done' ? '✓ 終了済み' : '終了にする'}</button>
          </div>
          <div className="row">{cur.attendees.map((a) => <span key={a} className="row" style={{ gap: 5 }}><Avatar member={member(a)} size="sm" /><span className="small">{member(a).name}</span></span>)}</div>
          <div className="editor" style={{ minHeight: 420 }}>
            <textarea value={minutes} placeholder="議事録を入力（Markdown）" onChange={(e) => { dirty.current = true; setMinutes(e.target.value); }} />
            <div className="md" dangerouslySetInnerHTML={{ __html: minutes ? md(minutes) : '<div class="empty">「テンプレート挿入」で議事録テンプレを読み込めます</div>' }} />
          </div>
        </div>
      </div>
      {creating ? <NewMeeting members={members} meId={me.id} onClose={() => setCreating(false)} onCreate={async (m) => { const row = await api<Meeting>('/api/meetings', { method: 'POST', body: JSON.stringify(m) }); setCreating(false); setId(row.id); toast('会議を作成しました'); load(); }} /> : null}
      {join ? (
        <Modal title={`🎥 ${join.title}`} onClose={() => setJoin(null)}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {join.attendees.slice(0, 6).map((a) => (
              <div key={a} style={{ aspectRatio: '16/10', borderRadius: 12, background: '#12131a', display: 'grid', placeItems: 'center', position: 'relative' }}>
                <Avatar member={member(a)} size="lg" />
                <span className="small" style={{ position: 'absolute', bottom: 6, left: 8, color: '#fff' }}>{member(a).name}</span>
              </div>
            ))}
          </div>
          <div className="small muted">デモ用のビデオ会議画面です。実際の通話は行われません。</div>
        </Modal>
      ) : null}
    </>
  );
}

function NewMeeting({ members, meId, onClose, onCreate }: { members: { id: string; name: string }[]; meId: string; onClose: () => void; onCreate: (m: { title: string; date: string; time: string; attendees: string[]; calendar: boolean }) => void }) {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(addDaysStr(todayYMD(), 1));
  const [time, setTime] = useState('10:00');
  const [att, setAtt] = useState<string[]>([meId]);
  const [cal, setCal] = useState(true);
  return (
    <Modal title="会議を作成" onClose={onClose} footer={<><button className="btn" type="button" onClick={onClose}>キャンセル</button><button className="btn primary" type="button" onClick={() => title.trim() && onCreate({ title, date, time, attendees: att, calendar: cal })}>作成</button></>}>
      <Field label="会議名"><input className="in" value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
      <div className="grid g2">
        <Field label="日付"><input className="in" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="時刻"><input className="in" type="time" value={time} onChange={(e) => setTime(e.target.value)} /></Field>
      </div>
      <Field label="参加者">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {members.map((m) => {
            const on = att.includes(m.id);
            return <span key={m.id} className={`chip ${on ? 'btn active' : ''}`} onClick={() => setAtt(on ? att.filter((id) => id !== m.id) : [...att, m.id])}>{m.name}</span>;
          })}
        </div>
      </Field>
      <label className="row small"><input type="checkbox" checked={cal} onChange={(e) => setCal(e.target.checked)} /> カレンダーにも登録する</label>
    </Modal>
  );
}
