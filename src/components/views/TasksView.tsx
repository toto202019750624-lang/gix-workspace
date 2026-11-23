'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { TASK_COLS } from '@/lib/constants';
import { addDaysStr, fmtMD, todayYMD } from '@/lib/dates';
import { api } from '@/lib/http';
import type { Task } from '@/lib/types';
import { Icon } from '../icons';
import { useGix } from '../Shell';
import { Avatar, Field, Modal, Prio, memberOptions } from '../ui';

export function TasksView() {
  const { me, member, members, toast, refresh } = useGix();
  const sp = useSearchParams();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [mode, setMode] = useState<'kanban' | 'list' | 'gantt'>('kanban');
  const [filter, setFilter] = useState<'all' | 'me' | 'high'>('all');
  const [editing, setEditing] = useState<Task | null>(null);
  const [creating, setCreating] = useState<Task | null>(null);
  const drag = useRef(false);
  const load = useCallback(async () => setTasks(await api<Task[]>('/api/tasks')), []);
  useEffect(() => { load().catch(() => undefined); }, [load]);
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (d?.type === 'task' || d?.type === 'poll') load().catch(() => undefined);
    };
    window.addEventListener('gix-rt', on);
    return () => window.removeEventListener('gix-rt', on);
  }, [load]);
  useEffect(() => {
    if (sp.get('new') === '1') setCreating(blank(me.id));
    const id = sp.get('edit');
    if (id && tasks.length) {
      const t = tasks.find((x) => x.id === id);
      if (t) setEditing(t);
    }
  }, [sp, tasks, me.id]);

  const shown = tasks.filter((t) => filter === 'all' || (filter === 'me' ? t.assigneeId === me.id : t.priority === '高'));
  const today = todayYMD();

  async function move(id: string, status: string) {
    const t = tasks.find((x) => x.id === id);
    if (!t || t.status === status) return;
    await api('/api/tasks/' + id, { method: 'PATCH', body: JSON.stringify({ status }) });
    toast(`「${t.title}」を${TASK_COLS.find((c) => c[0] === status)?.[1]}に移動`);
    await Promise.all([load(), refresh()]);
  }
  async function toggle(id: string) {
    const t = tasks.find((x) => x.id === id);
    if (!t) return;
    await api('/api/tasks/' + id, { method: 'PATCH', body: JSON.stringify({ status: t.status === 'done' ? 'todo' : 'done' }) });
    await Promise.all([load(), refresh()]);
  }
  async function save(t: Task, isNew: boolean) {
    const body = { ...t, subtasks: t.subtasks.map((s) => ({ title: s.title, done: s.done })) };
    if (isNew) await api('/api/tasks', { method: 'POST', body: JSON.stringify(body) });
    else await api('/api/tasks/' + t.id, { method: 'PATCH', body: JSON.stringify(body) });
    setEditing(null); setCreating(null);
    toast(isNew ? 'タスクを追加しました' : '保存しました');
    await Promise.all([load(), refresh()]);
  }
  async function remove(id: string) {
    await api('/api/tasks/' + id, { method: 'DELETE' });
    setEditing(null);
    await Promise.all([load(), refresh()]);
  }

  return (
    <>
      <div className="toolbar">
        <div className="seg">
          {([['kanban', 'カンバン'], ['list', 'リスト'], ['gantt', 'ガント']] as const).map(([k, l]) => <button key={k} className={mode === k ? 'on' : ''} type="button" onClick={() => setMode(k)}>{l}</button>)}
        </div>
        <div className="seg">
          {([['all', 'すべて'], ['me', '自分'], ['high', '優先度:高']] as const).map(([k, l]) => <button key={k} className={filter === k ? 'on' : ''} type="button" onClick={() => setFilter(k)}>{l}</button>)}
        </div>
        <div className="grow" />
        <span className="small muted">完了 {tasks.filter((t) => t.status === 'done').length}/{tasks.length}</span>
        <button className="btn primary" type="button" onClick={() => setCreating(blank(me.id))}><Icon name="plus" /> タスクを追加</button>
      </div>
      {mode === 'kanban' ? (
        <div className="kanban">
          {TASK_COLS.map(([k, l, c]) => {
            const list = shown.filter((t) => t.status === k);
            return (
              <div key={k} className="col" data-status={k}
                onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('over'); }}
                onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) e.currentTarget.classList.remove('over'); }}
                onDrop={(e) => { e.preventDefault(); e.currentTarget.classList.remove('over'); const id = e.dataTransfer.getData('text/plain'); if (id) move(id, k); }}>
                <div className="col-h"><i style={{ background: c }} />{l}<span className="badge b-m">{list.length}</span><span style={{ marginLeft: 'auto', cursor: 'pointer' }} className="muted" onClick={() => setCreating({ ...blank(me.id), status: k })}>＋</span></div>
                {list.map((t) => <TaskCard key={t.id} t={t} today={today} onOpen={() => { if (drag.current) { drag.current = false; return; } setEditing(t); }} onDrag={() => { drag.current = true; }} />)}
              </div>
            );
          })}
        </div>
      ) : null}
      {mode === 'list' ? (
        <div className="card" style={{ padding: 0, overflow: 'auto' }}>
          <table className="tbl">
            <thead><tr><th></th><th>タスク</th><th>担当</th><th>ステータス</th><th>優先度</th><th>開始</th><th>期限</th><th>サブタスク</th></tr></thead>
            <tbody>
              {shown.slice().sort((a, b) => a.due.localeCompare(b.due)).map((t) => {
                const col = TASK_COLS.find((c) => c[0] === t.status)!;
                return (
                  <tr key={t.id}>
                    <td><div className={`chk ${t.status === 'done' ? 'on' : ''}`} onClick={() => toggle(t.id)} /></td>
                    <td style={{ cursor: 'pointer', fontWeight: 600 }} className={t.status === 'done' ? 'done-text' : ''} onClick={() => setEditing(t)}>{t.title}</td>
                    <td><div className="row"><Avatar member={member(t.assigneeId)} size="sm" /><span className="small">{member(t.assigneeId).name}</span></div></td>
                    <td><span className="badge" style={{ background: col[2] + '33', color: col[2] }}>{col[1]}</span></td>
                    <td><Prio p={t.priority} /></td>
                    <td className="small muted">{fmtMD(t.start)}</td>
                    <td className="small">{fmtMD(t.due)}</td>
                    <td className="small muted">{t.subtasks.filter((s) => s.done).length}/{t.subtasks.length}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
      {mode === 'gantt' ? <Gantt tasks={shown} today={today} onEdit={setEditing} /> : null}
      {editing ? <TaskForm task={editing} members={members} onClose={() => setEditing(null)} onSave={(t) => save(t, false)} onDelete={() => remove(editing.id)} /> : null}
      {creating ? <TaskForm task={creating} members={members} onClose={() => setCreating(null)} onSave={(t) => save(t, true)} /> : null}
    </>
  );
}

function blank(me: string): Task {
  const today = todayYMD();
  return { id: '', title: '', status: 'todo', assigneeId: me, creatorId: me, start: today, due: addDaysStr(today, 3), priority: '中', tag: '社内', subtasks: [] };
}

function TaskCard({ t, today, onOpen, onDrag }: { t: Task; today: string; onOpen: () => void; onDrag: () => void }) {
  const { member } = useGix();
  const sd = t.subtasks.filter((s) => s.done).length;
  const over = t.due < today && t.status !== 'done';
  return (
    <div className="tcard" draggable onDragStart={(e) => { e.dataTransfer.setData('text/plain', t.id); e.currentTarget.classList.add('dragging'); onDrag(); }} onDragEnd={(e) => e.currentTarget.classList.remove('dragging')} onClick={onOpen}>
      <div className="row"><span className="badge b-c">{t.tag}</span><Prio p={t.priority} /></div>
      <div className="t">{t.title}</div>
      {t.subtasks.length ? <div className="row small muted" style={{ marginBottom: 6 }}><div className="prog" style={{ flex: 1 }}><i style={{ width: `${(sd / t.subtasks.length) * 100}%` }} /></div>{sd}/{t.subtasks.length}</div> : null}
      <div className="row small"><span className={over ? '' : 'muted'} style={over ? { color: 'var(--r)' } : undefined}>期限 {fmtMD(t.due)}</span><span style={{ marginLeft: 'auto' }}><Avatar member={member(t.assigneeId)} size="sm" /></span></div>
    </div>
  );
}

function Gantt({ tasks, today, onEdit }: { tasks: Task[]; today: string; onEdit: (t: Task) => void }) {
  const { member } = useGix();
  const days = 21;
  const s0 = addDaysStr(today, -7);
  const w = 100 / days;
  return (
    <div className="card gantt">
      <div className="g-row" style={{ minHeight: 28 }}>
        <div className="small muted">タスク</div>
        <div className="g-days">{Array.from({ length: days }, (_, i) => { const d = addDaysStr(s0, i); return <div key={d} style={d === today ? { color: 'var(--r)', fontWeight: 700 } : undefined}>{Number(d.slice(8))}</div>; })}</div>
      </div>
      {tasks.slice().sort((a, b) => a.start.localeCompare(b.start)).map((t) => {
        const a = Math.max(0, (Date.parse(t.start) - Date.parse(s0)) / 864e5);
        const b = Math.min(days, (Date.parse(t.due) - Date.parse(s0)) / 864e5 + 1);
        return (
          <div className="g-row" key={t.id}>
            <div className="row" style={{ minWidth: 0, cursor: 'pointer' }} onClick={() => onEdit(t)}>
              <Avatar member={member(t.assigneeId)} size="sm" />
              <span className="small" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.title}</span>
            </div>
            <div className="g-bars">
              {b > a ? <div className="g-bar" style={{ left: `${a * w}%`, width: `${(b - a) * w}%`, background: t.status === 'done' ? 'var(--border-strong)' : undefined, color: t.status === 'done' ? 'var(--muted)' : undefined }}>{member(t.assigneeId).name}</div> : null}
              <div className="g-today" style={{ left: `${7.5 * w}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TaskForm({ task, members, onClose, onSave, onDelete }: { task: Task; members: Parameters<typeof memberOptions>[0]; onClose: () => void; onSave: (t: Task) => void; onDelete?: () => void }) {
  const [t, setT] = useState(task);
  return (
    <Modal title={task.id ? 'タスクの詳細' : 'タスクを追加'} onClose={onClose} footer={<>
      {onDelete ? <button className="btn ng" style={{ marginRight: 'auto' }} type="button" onClick={onDelete}><Icon name="trash" /> 削除</button> : null}
      <button className="btn" type="button" onClick={onClose}>キャンセル</button>
      <button className="btn primary" type="button" onClick={() => onSave(t)}>{task.id ? '保存' : '追加'}</button>
    </>}>
      <Field label="タイトル"><input className="in" value={t.title} onChange={(e) => setT({ ...t, title: e.target.value })} /></Field>
      <div className="grid g2">
        <Field label="担当者"><select className="in" value={t.assigneeId} onChange={(e) => setT({ ...t, assigneeId: e.target.value })}>{memberOptions(members)}</select></Field>
        <Field label="ステータス"><select className="in" value={t.status} onChange={(e) => setT({ ...t, status: e.target.value })}>{TASK_COLS.map((c) => <option key={c[0]} value={c[0]}>{c[1]}</option>)}</select></Field>
        <Field label="開始日"><input className="in" type="date" value={t.start} onChange={(e) => setT({ ...t, start: e.target.value })} /></Field>
        <Field label="期限"><input className="in" type="date" value={t.due} onChange={(e) => setT({ ...t, due: e.target.value })} /></Field>
        <Field label="優先度"><select className="in" value={t.priority} onChange={(e) => setT({ ...t, priority: e.target.value })}>{['高', '中', '低'].map((p) => <option key={p}>{p}</option>)}</select></Field>
        <Field label="タグ"><input className="in" value={t.tag} onChange={(e) => setT({ ...t, tag: e.target.value })} /></Field>
      </div>
      <Field label="サブタスク">
        <div>
          {t.subtasks.map((s, i) => (
            <div className="row" style={{ marginBottom: 6 }} key={i}>
              <div className={`chk ${s.done ? 'on' : ''}`} onClick={() => setT({ ...t, subtasks: t.subtasks.map((x, j) => j === i ? { ...x, done: !x.done } : x) })} />
              <input className="in" value={s.title} onChange={(e) => setT({ ...t, subtasks: t.subtasks.map((x, j) => j === i ? { ...x, title: e.target.value } : x) })} />
            </div>
          ))}
        </div>
        <button className="btn sm" type="button" onClick={() => setT({ ...t, subtasks: [...t.subtasks, { id: '', title: '', done: false }] })}>＋ サブタスク追加</button>
      </Field>
    </Modal>
  );
}
