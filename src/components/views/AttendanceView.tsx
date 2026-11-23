'use client';

import { useCallback, useEffect, useState } from 'react';
import { fmtMD, hmNow, hmToMinutes, todayYMD } from '@/lib/dates';
import { durLabel } from '@/lib/format';
import { api } from '@/lib/http';
import { useGix } from '../Shell';

type Row = { date: string; inTime: string; outTime: string | null; breakMin: number };

export function AttendanceView() {
  const { me, members, clock, clockedIn } = useGix();
  const privileged = me.role === 'ceo' || me.role === 'vp' || (me.role === 'manager' && me.deptId === 'admin');
  const [userId, setUserId] = useState(me.id);
  const [rows, setRows] = useState<Row[]>([]);
  const load = useCallback(async () => {
    setRows(await api<Row[]>('/api/attendance?userId=' + userId));
  }, [userId]);
  useEffect(() => { load().catch(() => undefined); }, [load]);
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (d?.type === 'attendance' || d?.type === 'poll') load().catch(() => undefined);
    };
    window.addEventListener('gix-rt', on);
    return () => window.removeEventListener('gix-rt', on);
  }, [load]);
  const work = (r: Row) => (r.outTime ? hmToMinutes(r.outTime) - hmToMinutes(r.inTime) - r.breakMin : 0);
  const total = rows.reduce((s, r) => s + work(r), 0);
  const ot = rows.reduce((s, r) => s + Math.max(0, work(r) - 480), 0);
  const last7 = rows.slice(-7);
  const today = todayYMD();
  const mine = userId === me.id;
  return (
    <>
      <div className="grid" style={{ gridTemplateColumns: '1.2fr 2fr', marginBottom: 16 }}>
        <div className="card" style={{ textAlign: 'center' }}>
          <div className="muted">{fmtMD(today)}</div>
          <div className="clock"><Clock /></div>
          <div className="muted" style={{ marginBottom: 14 }}>{mine && clockedIn ? `出勤 ${clockedIn.inTime} ・ 勤務中` : mine ? '未出勤' : '参照のみ'}</div>
          {mine ? <div className="row" style={{ justifyContent: 'center' }}>{clockedIn ? <button className="btn ng" style={{ padding: '12px 28px' }} type="button" onClick={() => clock('out').then(load)}>退勤</button> : <button className="btn primary" style={{ padding: '12px 28px' }} type="button" onClick={() => clock('in').then(load)}>出勤</button>}</div> : null}
          {privileged ? (
            <div style={{ marginTop: 16 }}>
              <select className="in" value={userId} onChange={(e) => setUserId(e.target.value)}>
                {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
          ) : null}
        </div>
        <div className="grid g3">
          {[['今月の勤務時間', durLabel(total)], ['残業時間', durLabel(ot)], ['出勤日数', rows.length + '日']].map(([l, v]) => (
            <div className="card kpi" key={l}><div className="lbl">{l}</div><div className="num">{v}</div></div>
          ))}
          <div className="card" style={{ gridColumn: '1 / -1' }}>
            <h3>直近の勤務時間</h3>
            <div className="bar-chart" style={{ height: 90 }}>{last7.map((r) => <div key={r.date} style={{ height: `${Math.min(100, (work(r) / 660) * 100)}%` }} title={durLabel(work(r))}><span>{fmtMD(r.date).replace(/\(.\)/, '')}</span></div>)}</div>
            <div style={{ height: 18 }} />
          </div>
        </div>
      </div>
      <div className="card" style={{ padding: 0, overflow: 'auto' }}>
        <table className="tbl">
          <thead><tr><th>日付</th><th>出勤</th><th>退勤</th><th>休憩</th><th>勤務時間</th><th>状態</th></tr></thead>
          <tbody>
            {rows.slice().reverse().map((r) => (
              <tr key={r.date}>
                <td>{fmtMD(r.date)}</td>
                <td>{r.inTime}</td>
                <td>{r.outTime || '—'}</td>
                <td>{r.outTime ? `${r.breakMin}分` : '—'}</td>
                <td><b>{r.outTime ? durLabel(work(r)) : '勤務中'}</b></td>
                <td>{!r.outTime ? <span className="badge b-c">勤務中</span> : work(r) > 480 ? <span className="badge b-y">残業</span> : <span className="badge b-g">正常</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Clock() {
  const [t, setT] = useState(hmNow());
  useEffect(() => {
    const id = setInterval(() => setT(hmNow()), 1000);
    return () => clearInterval(id);
  }, []);
  return <span id="bigClock">{t}</span>;
}
