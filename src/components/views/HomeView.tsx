'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { addDaysStr, fmtMD, greet, hmNow, todayYMD } from '@/lib/dates';
import { greetName, yen } from '@/lib/format';
import { api } from '@/lib/http';
import type { Announcement, Approval, BaseRow, CalEvent, Task } from '@/lib/types';
import { Icon } from '../icons';
import { useGix } from '../Shell';
import { Avatar, Field, Modal, Prio, Spark } from '../ui';

export function HomeView() {
  const { me, member, openAI, toast, refresh, clock, clockedIn } = useGix();
  const router = useRouter();
  const [data, setData] = useState<{ ann: Announcement[]; events: CalEvent[]; tasks: Task[]; approvals: Approval[]; base: BaseRow[] } | null>(null);
  const [post, setPost] = useState(false);
  const today = todayYMD();
  const load = useCallback(async () => {
    const [ann, events, tasks, approvals, base] = await Promise.all([
      api<Announcement[]>('/api/announcements'),
      api<CalEvent[]>('/api/calendar'),
      api<Task[]>('/api/tasks'),
      api<Approval[]>('/api/approvals?tab=pending'),
      api<BaseRow[]>('/api/base'),
    ]);
    setData({ ann, events, tasks, approvals, base });
  }, []);
  useEffect(() => { load().catch(() => undefined); }, [load]);
  useEffect(() => {
    const on = () => load().catch(() => undefined);
    window.addEventListener('gix-rt', on);
    return () => window.removeEventListener('gix-rt', on);
  }, [load]);
  if (!data) return <div className="empty">読み込み中…</div>;
  const evs = data.events.filter((e) => e.date === today).sort((a, b) => a.start.localeCompare(b.start));
  const ownOpen = data.tasks.filter((t) => t.assigneeId === me.id && t.status !== 'done');
  const command = me.role === 'ceo' || me.role === 'vp';
  const mine = (command ? ownOpen.concat(data.tasks.filter((t) => t.assigneeId !== me.id && t.status !== 'done' && t.priority === '高')) : ownOpen).slice(0, 5);
  const soon = (command ? data.tasks : ownOpen).filter((t) => t.status !== 'done' && t.due <= addDaysStr(today, 2)).length;
  const vids = data.base.filter((r) => r.status === '公開').length;
  const views = data.base.reduce((s, r) => s + Number(r.views || 0), 0);
  const days = Array.from({ length: 7 }, (_, i) => fmtMD(addDaysStr(today, i - 6)).replace(/\(.\)/, ''));
  const weekly = [14, 18, 11, 22, 19, 25, 28];
  async function approve(id: string) {
    await api(`/api/approvals/${id}/decide`, { method: 'POST', body: JSON.stringify({ decision: 'approved' }) });
    toast('承認しました');
    await Promise.all([load(), refresh()]);
  }
  return (
    <>
      <div className="grid" style={{ gridTemplateColumns: '2fr 1fr', marginBottom: 16 }}>
        <div className="card hero">
          <div className="eyebrow">{fmtMD(today)} ・ GIX WORKSPACE</div>
          <h2>{greet()}、{greetName(me)}</h2>
          <p>今日は予定 <b>{evs.length}</b> 件、承認待ち <b>{data.approvals.length}</b> 件、期限が近いタスク <b>{soon}</b> 件です。</p>
          <div className="row" style={{ marginTop: 14, flexWrap: 'wrap' }}>
            <button className="btn primary" type="button" onClick={() => openAI('今日の優先事項')}><Icon name="spark" /> AIに今日のサマリーを聞く</button>
            <button className="btn" type="button" onClick={() => router.push('/tasks?new=1')}><Icon name="plus" /> タスク</button>
            <button className="btn" type="button" onClick={() => router.push('/calendar?new=1')}><Icon name="cal" /> 予定</button>
            <button className="btn" type="button" onClick={() => router.push('/approvals?new=経費')}><Icon name="flow" /> 申請</button>
          </div>
        </div>
        <div className="card">
          <h3><Icon name="clock" /> 勤怠</h3>
          <div className="clock" style={{ fontSize: 40 }}><LiveClock /></div>
          <div className="muted small" style={{ margin: '4px 0 12px' }}>{clockedIn ? `出勤 ${clockedIn.inTime}` : 'まだ出勤していません'}</div>
          {clockedIn
            ? <button className="btn ng" type="button" onClick={() => clock('out')}>退勤する</button>
            : <button className="btn primary" type="button" onClick={() => clock('in')}>出勤する</button>}
        </div>
      </div>
      <div className="grid g4" style={{ marginBottom: 16 }}>
        <Kpi label="今月の制作本数" num={String(74 + vids)} delta="+18% 前月比" values={[42, 48, 51, 55, 60, 66, 70, 74 + vids]} color="#6a6fc4" ic="film" />
        <Kpi label="チャンネル総再生" num={`${(12.4 + views / 1e6).toFixed(1)}M`} delta="+34% 前週比" values={[6, 7.2, 7.8, 8.9, 9.6, 11, 12.1, 12.4 + views / 1e6]} color="#4a90a4" ic="eye" />
        <Kpi label="フォロワー" num="31.2万" delta="+2.4万 今月" values={[18, 20, 22, 23.5, 25, 27, 29.5, 31.2]} color="#c2697f" ic="users" />
        <Kpi label="平均エンゲージ率" num="6.4%" delta="+0.8pt" values={[4.8, 5.1, 5.0, 5.6, 5.9, 6.0, 6.2, 6.4]} color="#5e9c7e" ic="trend" />
      </div>
      <div className="grid g3">
        <div className="card">
          <h3><Icon name="cal" /> 今日の予定<span className="more" onClick={() => router.push('/calendar?mode=day')}>すべて →</span></h3>
          {evs.length ? evs.map((e) => (
            <div className="list-item" key={e.id} onClick={() => router.push('/calendar?edit=' + e.id)}>
              <div style={{ width: 2, alignSelf: 'stretch', borderRadius: 2, background: e.color }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>{e.title}</div>
                <div className="small muted">{e.start}–{e.end} ・ {e.place}</div>
              </div>
              <div className="avs">{e.attendees.slice(0, 3).map((a) => <Avatar key={a} member={member(a)} size="sm" />)}</div>
            </div>
          )) : <div className="empty">予定はありません</div>}
        </div>
        <div className="card">
          <h3><Icon name="task" /> マイタスク<span className="more" onClick={() => router.push('/tasks')}>すべて →</span></h3>
          {mine.length ? null : <div className="empty">担当タスクはありません</div>}
          {mine.map((t) => (
            <div className="list-item" key={t.id}>
              <div className={`chk ${t.status === 'done' ? 'on' : ''}`} onClick={async (e) => { e.stopPropagation(); await api('/api/tasks/' + t.id, { method: 'PATCH', body: JSON.stringify({ status: t.status === 'done' ? 'todo' : 'done' }) }); load(); refresh(); }} />
              <div style={{ flex: 1, minWidth: 0 }} onClick={() => router.push('/tasks?edit=' + t.id)}>
                <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.title}</div>
                <div className="small muted">{fmtMD(t.due)} ・ {member(t.assigneeId).name}</div>
              </div>
              <Prio p={t.priority} />
            </div>
          ))}
        </div>
        <div className="card">
          <h3><Icon name="flow" /> 承認待ち<span className="more" onClick={() => router.push('/approvals')}>すべて →</span></h3>
          {data.approvals.length ? data.approvals.map((a) => (
            <div className="list-item" key={a.id}>
              <Avatar member={member(a.requesterId)} size="sm" />
              <div style={{ flex: 1, minWidth: 0 }} onClick={() => router.push('/approvals')}>
                <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.title}</div>
                <div className="small muted">{a.type}{a.amount ? ` ・ ${yen(a.amount)}` : ''}</div>
              </div>
              <button className="btn sm ok" type="button" onClick={() => approve(a.id)}>承認</button>
            </div>
          )) : <div className="empty">承認待ちはありません ✨</div>}
        </div>
        <div className="card span2">
          <h3><Icon name="bell" /> お知らせ</h3>
          {data.ann.map((a) => (
            <div className="list-item" key={a.id} style={{ alignItems: 'flex-start' }}>
              <Avatar member={member(a.authorId)} />
              <div style={{ flex: 1 }}>
                <div className="row"><b>{a.title}</b>{a.pin ? <span className="badge b-p">📌 固定</span> : null}<span className="badge b-m">{a.tag}</span></div>
                <div className="muted small" style={{ marginTop: 3 }}>{a.body}</div>
                <div className="faint small">{member(a.authorId).name} ・ {fmtMD(a.date)}</div>
              </div>
            </div>
          ))}
          <button className="btn sm" style={{ marginTop: 8 }} type="button" onClick={() => setPost(true)}><Icon name="plus" /> お知らせを投稿</button>
        </div>
        <div className="card">
          <h3><Icon name="film" /> 週間 公開本数</h3>
          <div className="bar-chart">{weekly.map((v, i) => <div key={days[i]} style={{ height: `${(v / 28) * 100}%` }} title={`${v}本`}><span>{days[i]}</span></div>)}</div>
          <div style={{ height: 22 }} />
          <div className="row small muted"><span>パイプライン</span><span style={{ marginLeft: 'auto' }}>{['企画', '撮影', '編集', '確認', '公開'].map((s) => `${s} ${data.base.filter((r) => r.status === s).length}`).join(' / ')}</span></div>
        </div>
      </div>
      {post ? <Announce onClose={() => setPost(false)} onDone={() => { setPost(false); load(); toast('お知らせを投稿しました'); }} /> : null}
    </>
  );
}

function LiveClock() {
  const [t, setT] = useState(hmNow());
  useEffect(() => { const id = setInterval(() => setT(hmNow()), 1000); return () => clearInterval(id); }, []);
  return <>{t}</>;
}

function Kpi({ label, num, delta, values, color, ic }: { label: string; num: string; delta: string; values: number[]; color: string; ic: string }) {
  return (
    <div className="card kpi">
      <div className="row"><span className="lbl">{label}</span><span style={{ marginLeft: 'auto' }} className="faint"><Icon name={ic} /></span></div>
      <div className="num">{num}</div>
      <div className="delta">▲ {delta}</div>
      <Spark values={values} color={color} />
    </div>
  );
}

function Announce({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [tag, setTag] = useState('全社');
  return (
    <Modal title="お知らせを投稿" onClose={onClose} footer={<>
      <button className="btn" type="button" onClick={onClose}>キャンセル</button>
      <button className="btn primary" type="button" onClick={async () => { if (!title.trim()) return; await api('/api/announcements', { method: 'POST', body: JSON.stringify({ title, body, tag }) }); onDone(); }}>投稿</button>
    </>}>
      <Field label="タイトル"><input className="in" value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
      <Field label="本文"><textarea className="in" rows={4} value={body} onChange={(e) => setBody(e.target.value)} /></Field>
      <Field label="タグ"><select className="in" value={tag} onChange={(e) => setTag(e.target.value)}><option>全社</option><option>人事</option><option>IT</option><option>イベント</option></select></Field>
    </Modal>
  );
}
