'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { EVENT_COLORS } from '@/lib/constants';
import { DOW, addDaysStr, fmtMD, todayYMD, utcDow } from '@/lib/dates';
import { api } from '@/lib/http';
import type { CalEvent } from '@/lib/types';
import { Icon } from '../icons';
import { useGix } from '../Shell';
import { Avatar, Field, Modal } from '../ui';

export function CalendarView() {
  const { me, members, member, toast } = useGix();
  const sp = useSearchParams();
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [mode, setMode] = useState<'month' | 'week' | 'day'>(sp.get('mode') === 'day' ? 'day' : 'month');
  const [cursor, setCursor] = useState(todayYMD());
  const [editing, setEditing] = useState<CalEvent | null>(null);
  const [creating, setCreating] = useState<Partial<CalEvent> | null>(null);
  const load = useCallback(async () => setEvents(await api<CalEvent[]>('/api/calendar')), []);
  useEffect(() => { load().catch(() => undefined); }, [load]);
  useEffect(() => {
    const id = sp.get('edit');
    if (id && events.length) {
      const ev = events.find((e) => e.id === id);
      if (ev) setEditing(ev);
    }
    if (sp.get('new') === '1') setCreating({ date: todayYMD(), start: '10:00', end: '11:00', attendees: [me.id], color: EVENT_COLORS[0] });
  }, [sp, events, me.id]);

  const today = todayYMD();
  function move(n: number) {
    if (n === 0) { setCursor(today); return; }
    if (mode === 'month') {
      const [y, m] = cursor.split('-').map(Number);
      const d = new Date(Date.UTC(y, m - 1 + n, 1));
      setCursor(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`);
    } else setCursor(addDaysStr(cursor, n * (mode === 'week' ? 7 : 1)));
  }
  async function save(e: CalEvent, isNew: boolean) {
    if (isNew) await api('/api/calendar', { method: 'POST', body: JSON.stringify(e) });
    else await api('/api/calendar/' + e.id, { method: 'PATCH', body: JSON.stringify(e) });
    setEditing(null); setCreating(null);
    toast(isNew ? '予定を作成しました' : '予定を更新しました');
    await load();
  }
  async function remove(id: string) {
    await api('/api/calendar/' + id, { method: 'DELETE' });
    setEditing(null);
    toast('予定を削除しました');
    await load();
  }

  const [y, m] = cursor.split('-').map(Number);
  const title = mode === 'month'
    ? `${y}年${m}月`
    : mode === 'week'
      ? `${fmtMD(addDaysStr(cursor, -utcDow(cursor)))} – ${fmtMD(addDaysStr(cursor, 6 - utcDow(cursor)))}`
      : `${y}年 ${fmtMD(cursor)}`;

  return (
    <>
      <div className="toolbar">
        <button className="btn" type="button" onClick={() => move(0)}>今日</button>
        <button className="icon-btn" type="button" onClick={() => move(-1)}><Icon name="chev" /></button>
        <button className="icon-btn" type="button" onClick={() => move(1)}><Icon name="chevr" /></button>
        <h2 style={{ margin: '0 8px', fontSize: 18 }}>{title}</h2>
        <div className="grow" />
        <div className="seg">
          {([['month', '月'], ['week', '週'], ['day', '日']] as const).map(([k, l]) => (
            <button key={k} className={mode === k ? 'on' : ''} type="button" onClick={() => setMode(k)}>{l}</button>
          ))}
        </div>
        <button className="btn primary" type="button" onClick={() => setCreating({ date: cursor, start: '10:00', end: '11:00', attendees: [me.id], color: EVENT_COLORS[0], title: '' })}><Icon name="plus" /> 予定を作成</button>
      </div>
      {mode === 'month' ? <Month cursor={cursor} today={today} events={events} onCreate={(date) => setCreating({ date, start: '10:00', end: '11:00', attendees: [me.id], color: EVENT_COLORS[0] })} onEdit={setEditing} /> : <Week mode={mode} cursor={cursor} today={today} events={events} onCreate={(date, start) => {
        const h = Number(start.slice(0, 2));
        const end = `${String(Math.min(23, h + 1)).padStart(2, '0')}:00`;
        setCreating({ date, start, end, attendees: [me.id], color: EVENT_COLORS[0] });
      }} onEdit={setEditing} />}
      {editing ? <EventForm event={editing} members={members} onClose={() => setEditing(null)} onSave={(e) => save(e, false)} onDelete={() => remove(editing.id)} /> : null}
      {creating ? <EventForm event={{ id: '', title: '', place: '', desc: '', color: EVENT_COLORS[0], attendees: [me.id], date: today, start: '10:00', end: '11:00', ...creating }} members={members} onClose={() => setCreating(null)} onSave={(e) => save(e, true)} /> : null}
      <span style={{ display: 'none' }}>{member(me.id).name}</span>
    </>
  );
}

function Month({ cursor, today, events, onCreate, onEdit }: { cursor: string; today: string; events: CalEvent[]; onCreate: (d: string) => void; onEdit: (e: CalEvent) => void }) {
  const [y, m] = cursor.split('-').map(Number);
  const firstDow = utcDow(`${y}-${String(m).padStart(2, '0')}-01`);
  const start = addDaysStr(`${y}-${String(m).padStart(2, '0')}-01`, -firstDow);
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const ds = addDaysStr(start, i);
    const evs = events.filter((e) => e.date === ds).sort((a, b) => a.start.localeCompare(b.start));
    const other = Number(ds.slice(5, 7)) !== m;
    cells.push(
      <div key={ds} className={`cal-cell ${other ? 'other' : ''} ${ds === today ? 'today' : ''}`} onClick={() => onCreate(ds)}>
        <div className="d">{Number(ds.slice(8))}</div>
        {evs.slice(0, 3).map((e) => (
          <div key={e.id} className="ev" style={{ background: e.color + '1c', boxShadow: `inset 2px 0 0 ${e.color}` }} onClick={(ev) => { ev.stopPropagation(); onEdit(e); }}>{e.start} {e.title}</div>
        ))}
        {evs.length > 3 ? <div className="small faint">+{evs.length - 3}件</div> : null}
      </div>,
    );
  }
  return (
    <div className="cal-grid">
      {DOW.map((d) => <div className="dow" key={d}>{d}</div>)}
      {cells}
    </div>
  );
}

function Week({ mode, cursor, today, events, onCreate, onEdit }: { mode: 'week' | 'day'; cursor: string; today: string; events: CalEvent[]; onCreate: (d: string, start: string) => void; onEdit: (e: CalEvent) => void }) {
  const { member } = useGix();
  const days = mode === 'week' ? Array.from({ length: 7 }, (_, i) => addDaysStr(cursor, i - utcDow(cursor))) : [cursor];
  const H0 = 7, H1 = 22;
  const now = new Date();
  return (
    <div style={{ overflow: 'auto', maxHeight: 'calc(100vh - 190px)', borderRadius: 12 }}>
      <div className={`week ${mode === 'day' ? 'day' : ''}`}>
        <div className="wk-h" />
        {days.map((d) => <div key={d} className="wk-h" style={{ fontWeight: 700, color: d === today ? 'var(--accent)' : undefined, boxShadow: d === today ? 'inset 0 -2px 0 var(--accent)' : undefined }}>{Number(d.slice(5, 7))}/{Number(d.slice(8))} ({DOW[utcDow(d)]})</div>)}
        <div>{Array.from({ length: H1 - H0 }, (_, i) => <div className="wk-hr" key={i}>{H0 + i}:00</div>)}</div>
        {days.map((ds) => {
          const evs = events.filter((e) => e.date === ds);
          return (
            <div className="wk-col" key={ds}>
              {Array.from({ length: H1 - H0 }, (_, i) => <div className="wk-slot" key={i} onClick={() => onCreate(ds, `${String(H0 + i).padStart(2, '0')}:00`)} />)}
              {evs.map((e) => {
                const [sh, sm] = e.start.split(':').map(Number);
                const [eh, em] = e.end.split(':').map(Number);
                const top = ((sh - H0) * 60 + sm) / 60 * 48;
                const ht = Math.max(22, ((eh - sh) * 60 + em - sm) / 60 * 48);
                return (
                  <div key={e.id} className="wk-ev" style={{ top, height: ht, background: e.color + '1f', boxShadow: `inset 3px 0 0 ${e.color}` }} onClick={() => onEdit(e)}>
                    <b>{e.title}</b><br />{e.start}–{e.end}{mode === 'day' ? ` ・ ${e.place || ''} ・ ${e.attendees.map((a) => member(a).name).slice(0, 5).join('、')}` : ''}
                  </div>
                );
              })}
              {ds === today ? <div style={{ position: 'absolute', left: 0, right: 0, top: ((now.getHours() - H0) * 60 + now.getMinutes()) / 60 * 48, height: 1.5, background: 'var(--r)' }} /> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EventForm({ event, members, onClose, onSave, onDelete }: { event: CalEvent; members: { id: string; name: string }[]; onClose: () => void; onSave: (e: CalEvent) => void; onDelete?: () => void }) {
  const [e, setE] = useState(event);
  return (
    <Modal title={event.id ? '予定を編集' : '予定を作成'} onClose={onClose} footer={<>
      {onDelete ? <button className="btn ng" style={{ marginRight: 'auto' }} type="button" onClick={onDelete}><Icon name="trash" /> 削除</button> : null}
      <button className="btn" type="button" onClick={onClose}>キャンセル</button>
      <button className="btn primary" type="button" onClick={() => onSave({ ...e, title: e.title || '（無題）' })}>{event.id ? '保存' : '作成'}</button>
    </>}>
      <Field label="タイトル"><input className="in" value={e.title} onChange={(ev) => setE({ ...e, title: ev.target.value })} /></Field>
      <div className="grid g3">
        <Field label="日付"><input className="in" type="date" value={e.date} onChange={(ev) => setE({ ...e, date: ev.target.value })} /></Field>
        <Field label="開始"><input className="in" type="time" value={e.start} onChange={(ev) => setE({ ...e, start: ev.target.value })} /></Field>
        <Field label="終了"><input className="in" type="time" value={e.end} onChange={(ev) => setE({ ...e, end: ev.target.value })} /></Field>
      </div>
      <Field label="場所"><input className="in" value={e.place} onChange={(ev) => setE({ ...e, place: ev.target.value })} /></Field>
      <Field label="参加者（クリックで選択）">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {members.map((m) => {
            const on = e.attendees.includes(m.id);
            return <span key={m.id} className={`chip ${on ? 'btn active' : ''}`} onClick={() => setE({ ...e, attendees: on ? e.attendees.filter((id) => id !== m.id) : [...e.attendees, m.id] })}>{m.name}</span>;
          })}
        </div>
      </Field>
      <Field label="カラー">
        <div className="row">{EVENT_COLORS.map((c) => <span key={c} onClick={() => setE({ ...e, color: c })} style={{ width: 24, height: 24, borderRadius: '50%', background: c, cursor: 'pointer', outline: e.color === c ? '2px solid var(--text)' : undefined, outlineOffset: 2 }} />)}</div>
      </Field>
      <Field label="メモ"><textarea className="in" rows={2} value={e.desc} onChange={(ev) => setE({ ...e, desc: ev.target.value })} /></Field>
    </Modal>
  );
}
