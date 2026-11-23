'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { NAV } from '@/lib/constants';
import { hmNow } from '@/lib/dates';
import { greetName } from '@/lib/format';
import { api, markLeaving } from '@/lib/http';
import { md } from '@/lib/markdown';
import type { Bootstrap, Member, Note } from '@/lib/types';
import { Icon } from './icons';
import { Avatar, Modal } from './ui';

type Gix = {
  me: Member;
  members: Member[];
  notifications: Note[];
  counts: Bootstrap['counts'];
  clockedIn: Bootstrap['clockedIn'];
  company: Bootstrap['company'];
  refresh: () => Promise<void>;
  toast: (s: string) => void;
  openAI: (q?: string, channelId?: string) => void;
  openProfile: (id: string) => void;
  member: (id: string) => Member;
  startDM: (id: string) => Promise<void>;
  clock: (action: 'in' | 'out') => Promise<void>;
};

const Ctx = createContext<Gix | null>(null);
export function useGix() {
  const v = useContext(Ctx);
  if (!v) throw new Error('GIX context missing');
  return v;
}

const fallback = (id: string): Member => ({
  id, email: '', name: id, deptId: 'exec', deptName: '', deptColor: '#888', role: 'member', roleLabel: '',
  title: '', skills: [], bio: '', ext: '', status: 'offline', grad: null, isBot: false, theme: 'light', sidebarCollapsed: false,
});

export function Shell({ children }: { children: React.ReactNode }) {
  const [boot, setBoot] = useState<Bootstrap | null>(null);
  const [err, setErr] = useState('');
  const [toasts, setToasts] = useState<string[]>([]);
  const [mobile, setMobile] = useState(false);
  const [palette, setPalette] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [profile, setProfile] = useState<string | null>(null);
  const [aiLog, setAiLog] = useState<{ who: 'me' | 'bot'; t: string }[]>([]);
  const [typing, setTyping] = useState(false);
  const [clockText, setClockText] = useState(hmNow());
  const router = useRouter();
  const pathname = usePathname();
  const view = pathname.split('/')[1] || 'home';

  const refresh = useCallback(async () => {
    const b = await api<Bootstrap>('/api/bootstrap');
    setBoot(b);
    document.body.classList.toggle('dark', b.me.theme === 'dark');
  }, []);

  useEffect(() => {
    refresh().catch((e) => setErr(e.message || '読み込みに失敗しました'));
  }, [refresh]);

  useEffect(() => {
    const id = setInterval(() => setClockText(hmNow()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!boot) return;
    const mode = boot.realtime || 'sse';
    let es: EventSource | null = null;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    let since = '';
    const connect = () => {
      es = new EventSource('/api/stream');
      es.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data);
          if (data.mode === 'poll') { es?.close(); return; }
          if (data.type && data.type !== 'hello') {
            window.dispatchEvent(new CustomEvent('gix-rt', { detail: data }));
            refresh().catch(() => undefined);
          }
        } catch { /* ignore */ }
      };
      es.onerror = () => {
        es?.close();
        if (!stopped && mode === 'sse') timer = setTimeout(connect, 3000);
      };
    };
    if (mode === 'sse') connect();
    const poll = setInterval(async () => {
      try {
        const sync = await api<{ now: string; events: { type: string; channelId?: string; userId?: string }[] }>(`/api/sync${since ? `?since=${encodeURIComponent(since)}` : ''}`);
        since = sync.now;
        if (sync.events.length) {
          refresh().catch(() => undefined);
          for (const ev of sync.events) window.dispatchEvent(new CustomEvent('gix-rt', { detail: ev }));
        } else {
          window.dispatchEvent(new CustomEvent('gix-rt', { detail: { type: 'poll' } }));
        }
      } catch { /* ignore */ }
    }, mode === 'poll' ? 2500 : 8000);
    const stop = () => { stopped = true; es?.close(); clearInterval(poll); clearTimeout(timer); };
    window.addEventListener('gix-stop', stop);
    return () => {
      stop();
      window.removeEventListener('gix-stop', stop);
    };
  }, [boot?.me.id, boot?.realtime, refresh]);

  const toast = useCallback((t: string) => {
    setToasts((s) => [...s, t]);
    setTimeout(() => setToasts((s) => s.slice(1)), 2200);
  }, []);

  const member = useCallback((id: string) => boot?.members.find((m) => m.id === id) || fallback(id), [boot]);

  const askAI = useCallback(async (q: string, channelId?: string) => {
    setAiOpen(true);
    setNotifOpen(false);
    setAiLog((l) => [...l, { who: 'me', t: q }, { who: 'bot', t: '' }]);
    setTyping(true);
    const write = (text: string) => setAiLog((l) => {
      const copy = l.slice();
      const last = copy[copy.length - 1];
      if (last?.who === 'bot') copy[copy.length - 1] = { who: 'bot', t: text };
      return copy;
    });
    try {
      const res = await fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ q, channelId }) });
      if (res.status === 401) { location.href = '/login'; return; }
      if (!res.ok || !res.body) throw new Error('ai');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let acc = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split('\n\n');
        buf = parts.pop() || '';
        for (const part of parts) {
          const line = part.split('\n').find((row) => row.startsWith('data:'));
          if (!line) continue;
          const payload = JSON.parse(line.slice(5).trim()) as { delta?: string };
          if (payload.delta) { acc += payload.delta; write(acc); }
        }
      }
      if (!acc) write('応答が空でした。');
    } catch {
      write('応答に失敗しました。もう一度お試しください。');
    } finally {
      setTyping(false);
    }
  }, []);

  const openAI = useCallback((q?: string, channelId?: string) => {
    setAiOpen(true);
    setNotifOpen(false);
    if (q) void askAI(q, channelId);
  }, [askAI]);

  useEffect(() => {
    if (boot && aiLog.length === 0) {
      setAiLog([{ who: 'bot', t: `こんにちは、${greetName(boot.me)}。GIX AIアシスタントです ✦\nチャンネルの要約、動画企画のドラフト、今日の優先事項の整理などをお手伝いします。下のボタンから試してみてください。` }]);
    }
  }, [boot, aiLog.length]);

  const startDM = useCallback(async (id: string) => {
    const ch = await api<{ id: string }>('/api/channels', { method: 'POST', body: JSON.stringify({ with: id }) });
    sessionStorage.setItem('gix-ch', ch.id);
    setProfile(null);
    setMobile(false);
    router.push(`/messenger?ch=${ch.id}`);
  }, [router]);

  const clock = useCallback(async (action: 'in' | 'out') => {
    const res = await api<{ clockedIn: { inTime: string } | null; outTime?: string }>('/api/attendance', { method: 'POST', body: JSON.stringify({ action }) });
    setBoot((b) => (b ? { ...b, clockedIn: res.clockedIn } : b));
    toast(action === 'in' ? `出勤しました（${res.clockedIn?.inTime || ''}）` : `退勤しました（${res.outTime || ''}）おつかれさまでした！`);
    window.dispatchEvent(new CustomEvent('gix-rt', { detail: { type: 'attendance' } }));
  }, [toast]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPalette((v) => !v);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        setAiOpen((v) => !v);
        setNotifOpen(false);
      } else if (e.key === 'Escape') {
        setPalette(false);
        setNotifOpen(false);
        setAiOpen(false);
        setProfile(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => { setMobile(false); }, [pathname]);
  useEffect(() => {
    const on = (e: Event) => setProfile((e as CustomEvent<string>).detail);
    window.addEventListener('gix-open-profile', on);
    return () => window.removeEventListener('gix-open-profile', on);
  }, []);

  const value = useMemo<Gix | null>(() => {
    if (!boot) return null;
    return {
      me: boot.me,
      members: boot.members,
      notifications: boot.notifications,
      counts: boot.counts,
      clockedIn: boot.clockedIn,
      company: boot.company,
      refresh, toast, openAI, openProfile: setProfile, member, startDM, clock,
    };
  }, [boot, refresh, toast, openAI, member, startDM, clock]);

  if (!boot || !value) {
    return (
      <div className="login-wrap">
        <div style={{ textAlign: 'center' }}>
          <div className="logo" style={{ margin: '0 auto 12px' }}>GIX</div>
          <div className="muted">{err || '読み込み中…'}</div>
        </div>
      </div>
    );
  }

  const session = boot;
  const title = NAV.find((n) => n.id === view)?.name || 'GIX Workspace';
  const unreadNotes = session.notifications.some((n) => !n.read);

  async function toggleTheme() {
    const theme = session.me.theme === 'dark' ? 'light' : 'dark';
    document.body.classList.toggle('dark', theme === 'dark');
    setBoot((b) => (b ? { ...b, me: { ...b.me, theme } } : b));
    await api('/api/me', { method: 'PATCH', body: JSON.stringify({ theme }) });
  }
  async function toggleSidebar() {
    if (window.innerWidth <= 760) { setMobile((v) => !v); return; }
    const sidebarCollapsed = !session.me.sidebarCollapsed;
    setBoot((b) => (b ? { ...b, me: { ...b.me, sidebarCollapsed } } : b));
    await api('/api/me', { method: 'PATCH', body: JSON.stringify({ sidebarCollapsed }) });
  }
  async function resetData() {
    if (!confirm('すべてのデータを初期状態に戻しますか？他のユーザーの変更も消えます。')) return;
    await api('/api/admin/reset', { method: 'POST' });
    location.reload();
  }
  async function resetBusiness() {
    if (!confirm('業務データを初期化します。メッセージ、タスク、承認、予定、会議、ドキュメント、ベース、勤怠、通知、OKR、AIの記録を消します。会社情報・社員・部署・チャンネルは残ります。元に戻せません。')) return;
    await api('/api/admin/reset-business', { method: 'POST' });
    location.reload();
  }
  async function logout() {
    markLeaving();
    window.dispatchEvent(new Event('gix-stop'));
    await fetch('/api/auth/logout', { method: 'POST' });
    location.href = '/login';
  }

  function badge(id: string) {
    if (id === 'messenger' && session.counts.messages) return <span className="badge b-p">{session.counts.messages}</span>;
    if (id === 'approvals' && session.counts.approvals) return <span className="badge b-y">{session.counts.approvals}</span>;
    if (id === 'tasks' && session.counts.tasks) return <span className="badge">{session.counts.tasks}</span>;
    return null;
  }

  return (
    <Ctx.Provider value={value}>
      <div className="app">
        <aside className={`sidebar ${session.me.sidebarCollapsed ? 'collapsed' : ''} ${mobile ? 'mobile-open' : ''}`} id="sidebar">
          <div className="brand">
            <div className="logo">GIX</div>
            <div><b>GIX Workspace</b><small>株式会社GIX</small></div>
          </div>
          <nav className="nav">
            {NAV.map((n, i) => n.sep ? (
              <div className="nav-sep" key={n.sep}>{n.sep}</div>
            ) : (
              <div key={n.id} className={`nav-item ${view === n.id ? 'active' : ''}`} title={n.name} onClick={() => router.push('/' + n.id)}>
                <Icon name={n.ic || 'home'} />
                <span>{n.name}</span>
                {badge(n.id || '')}
              </div>
            ))}
          </nav>
          <div className="side-foot">
            <div className="nav-item" onClick={() => setProfile(session.me.id)}>
              <Avatar member={session.me} size="sm" />
              <span>{session.me.name}<small className="faint" style={{ display: 'block', fontSize: 11 }}>{session.me.title}</small></span>
            </div>
            <div className="nav-item" onClick={logout}><Icon name="x" /><span>ログアウト</span></div>
            {session.me.role === 'ceo' ? (
              <>
                <div className="nav-item" onClick={resetBusiness} title="業務データを初期化">
                  <Icon name="trash" />
                  <span>業務データを初期化</span>
                </div>
                <div className="nav-item" onClick={resetData} title="データ初期化">
                  <Icon name="reply" />
                  <span>データ初期化</span>
                </div>
              </>
            ) : null}
          </div>
        </aside>
        <main className="main">
          <header className="topbar">
            <button className="icon-btn" onClick={toggleSidebar} title="サイドバー" type="button"><Icon name="collapse" /></button>
            <h1>{title}</h1>
            <span className="desk-only" id="clockPill">
              {session.clockedIn ? <span className="badge b-g">● 勤務中 {session.clockedIn.inTime}〜</span> : <span className="badge b-m">未出勤</span>}
            </span>
            <div className="search-trigger" onClick={() => setPalette(true)}>
              <Icon name="search" style={{ width: 16, height: 16 }} />
              <span>検索・コマンド</span>
              <kbd>Ctrl K</kbd>
            </div>
            <button className="icon-btn" title="AIアシスタント (Ctrl+J)" type="button" onClick={() => openAI()}><Icon name="spark" /></button>
            <button className="icon-btn" title="通知" type="button" onClick={() => { setNotifOpen(true); setAiOpen(false); }}>
              <Icon name="bell" />
              {unreadNotes ? <span className="dot" /> : null}
            </button>
            <button className="icon-btn" title="テーマ切替" type="button" onClick={toggleTheme}><Icon name={session.me.theme === 'dark' ? 'sun' : 'moon'} /></button>
          </header>
          <section className="content">
            <div className="view">{children}</div>
          </section>
        </main>
      </div>
      <span className="faint" style={{ display: 'none' }}>{clockText}</span>
      {toasts.map((t, i) => <div className="toast" key={i}>{t}</div>)}
      {palette ? <Palette onClose={() => setPalette(false)} /> : null}
      <aside className={`drawer ${notifOpen ? 'open' : ''}`}>
        {notifOpen ? <NotifDrawer onClose={() => setNotifOpen(false)} /> : null}
      </aside>
      <aside className={`drawer ${aiOpen ? 'open' : ''}`}>
        {aiOpen ? <AiDrawer log={aiLog} typing={typing} onAsk={(q) => askAI(q)} onClose={() => setAiOpen(false)} /> : null}
      </aside>
      {profile ? <Profile id={profile} onClose={() => setProfile(null)} /> : null}
    </Ctx.Provider>
  );
}

function Profile({ id, onClose }: { id: string; onClose: () => void }) {
  const { member, members, startDM, me } = useGix();
  const m = member(id);
  const tasks = 0;
  return (
    <Modal
      title="プロフィール"
      onClose={onClose}
      footer={id !== me.id ? (
        <button className="btn primary" style={{ marginRight: 'auto' }} type="button" onClick={() => startDM(id)}>
          <Icon name="chat" style={{ width: 15, height: 15 }} /> メッセージ
        </button>
      ) : <span />}
    >
      <div className="row" style={{ gap: 16 }}>
        <Avatar member={m} size="lg" />
        <div>
          <div style={{ fontSize: 19, fontWeight: 800 }}>{m.name}</div>
          <div className="muted">{m.title}</div>
          <span className="badge" style={{ background: m.deptColor + '26', color: m.deptColor, marginTop: 6 }}>{m.deptName}</span>
          <span className="badge b-m" style={{ marginLeft: 6 }}>{m.roleLabel}</span>
        </div>
      </div>
      <div>{m.bio}</div>
      <div className="row" style={{ flexWrap: 'wrap' }}>{m.skills.map((s) => <span className="badge b-c" key={s}>{s}</span>)}</div>
      <div className="grid g2 small">
        <div><span className="muted">メール</span><br />{m.email}</div>
        <div><span className="muted">内線</span><br />{m.ext}</div>
        <div><span className="muted">所属</span><br />{m.deptId === 'codex' ? '制作会社Codex → GIX出向' : '株式会社GIX'}</div>
        <div><span className="muted">社員</span><br />{members.length}名</div>
      </div>
      <span style={{ display: 'none' }}>{tasks}</span>
    </Modal>
  );
}

function NotifDrawer({ onClose }: { onClose: () => void }) {
  const { notifications, refresh } = useGix();
  const router = useRouter();
  async function read(id?: string) {
    await api('/api/notifications/read', { method: 'POST', body: JSON.stringify(id ? { id } : { all: true }) });
    await refresh();
    if (!id) return;
    const n = notifications.find((x) => x.id === id);
    onClose();
    if (n?.go) router.push('/' + n.go);
  }
  return (
    <>
      <div className="drawer-h">
        <Icon name="bell" style={{ width: 18, height: 18 }} /> 通知センター
        <button className="btn sm" style={{ marginLeft: 'auto' }} type="button" onClick={() => read()}>すべて既読</button>
        <button className="icon-btn" style={{ width: 32, height: 32 }} type="button" onClick={onClose}><Icon name="x" /></button>
      </div>
      <div className="drawer-b">
        {notifications.length ? notifications.map((n) => (
          <div className={`notif ${n.read ? '' : 'unread'}`} key={n.id} onClick={() => read(n.id)}>
            <span className="notif-ic"><Icon name={n.icon} /></span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13 }}>{n.text}</div>
              <div className="small faint">{rel(n.ts)}</div>
            </div>
            {n.read ? null : <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', marginTop: 6 }} />}
          </div>
        )) : <div className="empty">通知はありません</div>}
      </div>
    </>
  );
}

function rel(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'たった今';
  if (s < 3600) return `${Math.floor(s / 60)}分前`;
  if (s < 86400) return `${Math.floor(s / 3600)}時間前`;
  return `${Math.floor(s / 86400)}日前`;
}

function AiDrawer({ log, typing, onAsk, onClose }: { log: { who: 'me' | 'bot'; t: string }[]; typing: boolean; onAsk: (q: string) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (ref.current) ref.current.scrollTop = ref.current.scrollHeight; }, [log, typing]);
  const chips = ['チャンネルを要約', '動画企画を作って', '今日の優先事項', '承認待ちを確認', 'KPIを分析'];
  return (
    <>
      <div className="drawer-h">
        <span className="logo" style={{ width: 28, height: 28, fontSize: 13 }}>✦</span>
        <div>GIX AI<div className="small muted" style={{ fontWeight: 400 }}>社内アシスタント</div></div>
        <button className="icon-btn" style={{ marginLeft: 'auto', width: 32, height: 32 }} type="button" onClick={onClose}><Icon name="x" /></button>
      </div>
      <div className="drawer-b" ref={ref}>
        {log.map((m, i) => m.who === 'bot'
          ? <div className="ai-msg bot" key={i} dangerouslySetInnerHTML={{ __html: md(m.t) }} />
          : <div className="ai-msg me" key={i}>{m.t}</div>)}
        {typing ? <div className="ai-msg bot typing"><span /><span /><span /></div> : null}
      </div>
      <div className="chips">{chips.map((c) => <button className="chip" type="button" key={c} onClick={() => onAsk(c)}>{c}</button>)}</div>
      <div style={{ padding: '10px 14px 14px' }}>
        <div className="row" style={{ background: 'var(--hover)', border: '1px solid var(--border)', borderRadius: 12, padding: 5 }}>
          <input ref={input} style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', padding: 6 }} placeholder="AIに質問…"
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing && input.current?.value.trim()) { onAsk(input.current.value); input.current.value = ''; } }} />
          <button className="btn primary sm" type="button" onClick={() => { if (input.current?.value.trim()) { onAsk(input.current.value); input.current.value = ''; } }}>送信</button>
        </div>
      </div>
    </>
  );
}

function Palette({ onClose }: { onClose: () => void }) {
  const { members, me, clock, openAI } = useGix();
  const router = useRouter();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const [extra, setExtra] = useState<Item[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const go = (href: string) => { onClose(); router.push(href); };
  type Item = { g: string; t: string; sub?: string; run: () => void; av?: string; ic?: string };
  const base: Item[] = [
    ...NAV.filter((n) => n.id).map((n) => ({ g: 'ページ', ic: n.ic, t: n.name || '', run: () => go('/' + n.id) })),
    { g: 'アクション', ic: 'task', t: '新しいタスク', run: () => go('/tasks?new=1') },
    { g: 'アクション', ic: 'cal', t: '新しい予定', run: () => go('/calendar?new=1') },
    { g: 'アクション', ic: 'flow', t: '経費申請', run: () => go('/approvals?new=経費') },
    { g: 'アクション', ic: 'doc', t: '新規ドキュメント', run: () => go('/docs?new=1') },
    { g: 'アクション', ic: 'spark', t: 'AIアシスタントを開く', run: () => { onClose(); openAI(); } },
    { g: 'アクション', ic: 'sun', t: 'テーマ切替（ダーク/ライト）', run: () => { document.querySelector<HTMLButtonElement>('[title="テーマ切替"]')?.click(); onClose(); } },
    { g: 'アクション', ic: 'clock', t: '出勤 / 退勤', run: () => { onClose(); void clock(document.getElementById('clockPill')?.textContent?.includes('勤務中') ? 'out' : 'in'); } },
  ].filter((it) => !q || it.t.toLowerCase().includes(q.toLowerCase()));
  const items = [...base, ...extra].slice(0, 40);

  useEffect(() => { input.current?.focus(); }, []);
  useEffect(() => { setSel(0); }, [q, extra]);
  useEffect(() => {
    if (!q.trim()) { setExtra([]); return; }
    const t = setTimeout(() => {
      api<{
        members: Member[];
        tasks: { id: string; title: string; due: string }[];
        docs: { id: string; title: string }[];
        events: { id: string; title: string; date: string; start: string }[];
        base: { title: string; status: string }[];
        messages: { text: string; channelId: string; channel: string; userId: string }[];
        approvals: { title: string; status: string }[];
      }>(`/api/search?q=${encodeURIComponent(q)}`).then((r) => {
        const rows = [
          ...r.members.slice(0, 5).map((m) => ({ g: 'メンバー', av: m.id, t: m.name, sub: m.title, run: () => { onClose(); window.dispatchEvent(new CustomEvent('gix-open-profile', { detail: m.id })); } })),
          ...r.tasks.slice(0, 5).map((t) => ({ g: 'タスク', ic: 'task', t: t.title, sub: t.due, run: () => go('/tasks?edit=' + t.id) })),
          ...r.docs.slice(0, 5).map((d) => ({ g: 'ドキュメント', ic: 'doc', t: d.title, run: () => go('/docs?doc=' + d.id) })),
          ...r.events.slice(0, 4).map((e) => ({ g: '予定', ic: 'cal', t: e.title, sub: `${e.date} ${e.start}`, run: () => go('/calendar?edit=' + e.id) })),
          ...r.base.slice(0, 4).map((b) => ({ g: 'ベース', ic: 'film', t: b.title, sub: b.status, run: () => go('/base?q=' + encodeURIComponent(b.title)) })),
          ...r.messages.slice(0, 4).map((m) => ({ g: 'メッセージ', av: m.userId, t: m.text, sub: '#' + m.channel, run: () => go('/messenger?ch=' + m.channelId) })),
          ...r.approvals.slice(0, 3).map((a) => ({ g: '承認', ic: 'flow', t: a.title, sub: a.status === 'pending' ? '承認待ち' : a.status === 'approved' ? '承認済み' : a.status === 'rejected' ? '却下' : a.status, run: () => go('/approvals?tab=all') })),
        ];
        setExtra(rows);
      }).catch(() => setExtra([]));
    }, 120);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal palette" style={{ width: 'min(640px, 94vw)' }}>
        <input ref={input} placeholder="検索・コマンド（ページ、メンバー、タスク、ドキュメント、メッセージ…）" value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(items.length - 1, s + 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
            else if (e.key === 'Enter' && !e.nativeEvent.isComposing && items[sel]) items[sel].run();
          }} />
        <div style={{ maxHeight: '56vh', overflowY: 'auto', paddingBottom: 8 }}>
          {items.length ? items.map((it, i) => (
            <div key={it.g + it.t + i}>
              {(i === 0 || items[i - 1].g !== it.g) ? <div className="pal-group">{it.g}</div> : null}
              <div className={`pal-item ${i === sel ? 'sel' : ''}`} onMouseEnter={() => setSel(i)} onClick={it.run}>
                {it.av ? <Avatar member={members.find((m) => m.id === it.av) || me} size="sm" /> : <span className="faint" style={{ display: 'inline-flex' }}><Icon name={it.ic || 'search'} style={{ width: 17, height: 17 }} /></span>}
                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.t}</span>
                {it.sub ? <span className="faint small" style={{ marginLeft: 'auto', whiteSpace: 'nowrap' }}>{it.sub}</span> : null}
              </div>
            </div>
          )) : <div className="empty">見つかりませんでした</div>}
        </div>
        <div className="small faint" style={{ padding: '8px 20px', borderTop: '1px solid var(--border)' }}>↑↓ 選択 ・ Enter 開く ・ Esc 閉じる</div>
      </div>
    </div>
  );
}
