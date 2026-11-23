'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/http';
import { Icon } from '../icons';
import { useGix } from '../Shell';
import { Avatar } from '../ui';

type Log = { id: string; userId: string; kind: string; summary: string; viaLlm: boolean; ts: string };

export function AiStaffView() {
  const { me, member, toast } = useGix();
  const [enabled, setEnabled] = useState(true);
  const [last, setLast] = useState<string | null>(null);
  const [rows, setRows] = useState<Log[]>([]);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const data = await api<{ enabled: boolean; lastTickAt: string | null; activities: Log[] }>('/api/ai-employees');
    setEnabled(data.enabled);
    setLast(data.lastTickAt);
    setRows(data.activities);
  }, []);
  useEffect(() => { load().catch(() => undefined); }, [load]);
  const canRun = me.role === 'ceo' || me.role === 'vp';
  return (
    <>
      <div className="card hero" style={{ marginBottom: 16 }}>
        <div className="eyebrow">Grok Bot が文章を書き、アプリに記録します</div>
        <h2>AI社員</h2>
        <p>平日 9–19時（日本時間）は自動で出勤・退勤します。チャットや承認などの文章は、外部のエージェントが API から投稿します。{last ? `最終稼働 ${last.slice(11, 16)} UTC` : ''}</p>
        <div className="row" style={{ marginTop: 12, flexWrap: 'wrap' }}>
          {me.role === 'ceo' ? (
            <button className={`btn ${enabled ? 'ok' : ''}`} type="button" onClick={async () => {
              const next = await api<{ enabled: boolean }>('/api/ai-employees/settings', { method: 'POST', body: JSON.stringify({ enabled: !enabled }) });
              setEnabled(next.enabled);
              toast(next.enabled ? 'AI社員をオンにしました' : 'AI社員をオフにしました');
            }}>{enabled ? '稼働中' : '停止中'}</button>
          ) : <span className={`badge ${enabled ? 'b-g' : 'b-m'}`}>{enabled ? '稼働中' : '停止中'}</span>}
          {canRun ? <button className="btn primary" type="button" disabled={busy} onClick={async () => {
            setBusy(true);
            try {
              const result = await api<{ skipped?: boolean; reason?: string; acted?: string[] }>('/api/ai-employees/run', { method: 'POST' });
              toast(result.skipped ? `スキップ（${result.reason}）` : `出勤・退勤を更新しました（${result.acted?.length || 0}）`);
              await load();
            } catch (error) {
              toast(error instanceof Error ? error.message : '失敗しました');
            } finally { setBusy(false); }
          }}><Icon name="spark" /> AI社員を動かす</button> : null}
        </div>
      </div>
      <div className="card" style={{ padding: 0 }}>
        {rows.length ? rows.map((row) => (
          <div className="list-item" key={row.id}>
            <Avatar member={member(row.userId)} size="sm" />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600 }}>{row.summary}</div>
              <div className="small muted">{row.kind} ・ {row.ts.replace('T', ' ').slice(0, 16)}</div>
            </div>
            <span className="badge">AI</span>
          </div>
        )) : <div className="empty">今日の記録はまだありません</div>}
      </div>
    </>
  );
}
