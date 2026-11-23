'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { EMOJIS } from '@/lib/constants';
import { timeAgo, tokyoParts } from '@/lib/dates';
import { api } from '@/lib/http';
import type { Attachment, Channel, ChatMessage } from '@/lib/types';
import { Icon } from '../icons';
import { useGix } from '../Shell';
import { Avatar, Field, MessageText, Modal } from '../ui';

export function MessengerView() {
  const { me, members, member, refresh, openAI, toast } = useGix();
  const sp = useSearchParams();
  const router = useRouter();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [ch, setCh] = useState(sp.get('ch') || (typeof window !== 'undefined' ? sessionStorage.getItem('gix-ch') : '') || 'general');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [q, setQ] = useState('');
  const [draft, setDraft] = useState('');
  const [thread, setThread] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const [mention, setMention] = useState<{ id: string; name: string; dept: string }[]>([]);
  const [files, setFiles] = useState<Attachment[]>([]);
  const [emoji, setEmoji] = useState<{ x: number; y: number; id: string | null } | null>(null);
  const [creating, setCreating] = useState(false);
  const [showCh, setShowCh] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const names = members.map((m) => m.name);

  const loadChannels = useCallback(async () => {
    setChannels(await api<Channel[]>('/api/channels'));
  }, []);
  const loadMessages = useCallback(async (id: string) => {
    const rows = await api<ChatMessage[]>(`/api/channels/${id}/messages`);
    setMessages(rows);
    api(`/api/channels/${id}/read`, { method: 'POST' }).then(() => refresh()).catch(() => undefined);
  }, [refresh]);

  useEffect(() => { loadChannels().catch(() => undefined); }, [loadChannels]);
  useEffect(() => {
    const id = sp.get('ch');
    if (id) setCh(id);
  }, [sp]);
  useEffect(() => {
    if (!ch) return;
    sessionStorage.setItem('gix-ch', ch);
    setThread(null);
    loadMessages(ch).catch(() => undefined);
  }, [ch, loadMessages]);
  useEffect(() => {
    const el = box.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, ch]);
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent).detail || {};
      if (d.type === 'message' || d.type === 'poll') {
        loadChannels().catch(() => undefined);
        if (!d.channelId || d.channelId === ch) loadMessages(ch).catch(() => undefined);
      }
    };
    window.addEventListener('gix-rt', on);
    return () => window.removeEventListener('gix-rt', on);
  }, [ch, loadChannels, loadMessages]);

  const current = channels.find((c) => c.id === ch) || channels[0];
  const title = current ? (current.kind === 'dm' && current.peerId ? member(current.peerId).name : current.name) : '';
  const filtered = q.trim()
    ? messages.filter((m) => m.text.includes(q.trim()) || member(m.userId).name.includes(q.trim()))
    : messages;
  const threadMsg = thread ? messages.find((m) => m.id === thread) : null;

  function onDraft(v: string) {
    setDraft(v);
    const m = v.match(/@([^\s@]*)$/);
    if (!m) { setMention([]); return; }
    const hits = members.filter((x) => x.name.replace(/\s/g, '').includes(m[1]) || x.id.includes(m[1].toLowerCase())).slice(0, 6);
    setMention(hits.map((h) => ({ id: h.id, name: h.name, dept: h.deptName })));
  }
  function pickMention(name: string) {
    setDraft((v) => v.replace(/@([^\s@]*)$/, '@' + name + ' '));
    setMention([]);
    input.current?.focus();
  }
  async function send(text: string, parentId?: string) {
    const t = text.trim();
    if (!t && !files.length) return;
    await api(`/api/channels/${ch}/messages`, {
      method: 'POST',
      body: JSON.stringify({ text: t, parentId, attachmentIds: parentId ? [] : files.map((f) => f.id) }),
    });
    if (!parentId) { setDraft(''); setFiles([]); }
    else setReply('');
    await loadMessages(ch);
  }
  async function react(id: string, emojiChar: string) {
    await api(`/api/messages/${id}/reactions`, { method: 'POST', body: JSON.stringify({ emoji: emojiChar }) });
    setEmoji(null);
    await loadMessages(ch);
  }
  async function upload(file: File) {
    const fd = new FormData();
    fd.set('file', file);
    const att = await api<Attachment>('/api/upload', { method: 'POST', body: fd });
    setFiles((s) => [...s, att]);
  }

  const chItem = (c: Channel) => (
    <div className={`ch ${c.id === ch ? 'on' : ''}`} key={c.id} onClick={() => { setCh(c.id); setShowCh(false); router.replace('/messenger?ch=' + c.id); }}>
      {c.kind === 'dm' && c.peerId ? <Avatar member={member(c.peerId)} size="sm" /> : <span className="faint"><Icon name="hash" style={{ width: 15, height: 15 }} /></span>}
      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.kind === 'dm' && c.peerId ? member(c.peerId).name : c.name}</span>
      {c.unread ? <span className="badge b-p">{c.unread}</span> : null}
    </div>
  );

  return (
    <div className={`card msgr ${threadMsg ? 'thread-open' : ''} ${showCh ? 'show-ch' : ''}`} id="msgr">
      <div className="ch-list">
        <input className="in" placeholder="メッセージ検索" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="nav-sep" style={{ paddingLeft: 4 }}>チャンネル <span style={{ float: 'right', cursor: 'pointer' }} onClick={() => setCreating(true)}>＋</span></div>
        {channels.filter((c) => c.kind === 'channel').map(chItem)}
        <div className="nav-sep" style={{ paddingLeft: 4 }}>ダイレクトメッセージ</div>
        {channels.filter((c) => c.kind === 'dm').map(chItem)}
      </div>
      <div className="chat">
        <div className="chat-head">
          <button className="icon-btn mobile-only" style={{ width: 32, height: 32 }} type="button" onClick={() => setShowCh((v) => !v)}><Icon name="chev" /></button>
          {current?.kind === 'dm' && current.peerId ? <Avatar member={member(current.peerId)} /> : <span className="ch-hash">#</span>}
          <div>
            <b>{title}</b>
            <div className="small muted">{current?.kind === 'dm' && current.peerId ? member(current.peerId).title : current?.desc}</div>
          </div>
          <div style={{ marginLeft: 'auto' }} className="row">
            <button className="btn sm" type="button" onClick={() => openAI(`#${title} を要約して`, ch)}><Icon name="spark" /> AI要約</button>
            <button className="btn sm" type="button" onClick={() => router.push('/meetings')}><Icon name="meet" /> 通話</button>
          </div>
        </div>
        <div className="msgs" ref={box}>
          {q ? <div className="small muted" style={{ padding: 6 }}>「{q}」の検索結果: {filtered.length}件</div> : null}
          {filtered.length ? filtered.map((m) => <Msg key={m.id} m={m} names={names} meId={me.id} onReact={(id, em) => react(id, em)} onThread={setThread} onEmoji={(e, id) => setEmoji({ x: e.clientX, y: e.clientY, id })} />) : <div className="empty">メッセージはまだありません</div>}
        </div>
        <div className="composer">
          {mention.length ? (
            <div className="mention-pop">
              {mention.map((h) => (
                <div className="pal-item" key={h.id} onClick={() => pickMention(h.name)}>
                  <Avatar member={member(h.id)} size="sm" /> {h.name} <span className="faint small">{h.dept}</span>
                </div>
              ))}
            </div>
          ) : null}
          {files.length ? <div style={{ marginBottom: 6 }}>{files.map((f) => <span className="badge b-m file-chip" key={f.id}>{f.filename}</span>)}</div> : null}
          <div className="box">
            <button className="icon-btn" style={{ width: 32, height: 32, border: 'none' }} type="button" onClick={(e) => setEmoji({ x: e.clientX, y: e.clientY - 40, id: null })}><Icon name="smile" /></button>
            <label className="icon-btn" style={{ width: 32, height: 32, border: 'none' }} title="ファイルを添付">
              <Icon name="clip" />
              <input type="file" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f).catch((err) => toast(err.message)); e.target.value = ''; }} />
            </label>
            <input ref={input} value={draft} placeholder={`#${title} へメッセージ（@でメンション）`} autoComplete="off"
              onChange={(e) => onDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { if (mention[0]) { pickMention(mention[0].name); e.preventDefault(); return; } send(draft); } }} />
            <button className="btn primary sm" type="button" onClick={() => send(draft)}><Icon name="send" style={{ width: 14, height: 14 }} /> 送信</button>
          </div>
        </div>
      </div>
      {threadMsg ? (
        <div className="thread-pane">
          <div className="chat-head"><b>スレッド</b><button className="icon-btn" style={{ marginLeft: 'auto', width: 30, height: 30 }} type="button" onClick={() => setThread(null)}><Icon name="x" /></button></div>
          <div className="msgs">
            <Msg m={threadMsg} names={names} meId={me.id} inThread onReact={(id, em) => react(id, em)} onThread={() => undefined} onEmoji={(e, id) => setEmoji({ x: e.clientX, y: e.clientY, id })} />
            <div className="nav-sep">{threadMsg.replies.length}件の返信</div>
            {threadMsg.replies.map((r) => <Msg key={r.id} m={r} names={names} meId={me.id} inThread onReact={(id, em) => react(id, em)} onThread={() => undefined} onEmoji={(e, id) => setEmoji({ x: e.clientX, y: e.clientY, id })} />)}
          </div>
          <div className="composer"><div className="box">
            <input value={reply} placeholder="スレッドに返信" onChange={(e) => setReply(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) send(reply, threadMsg.id); }} />
            <button className="btn primary sm" type="button" onClick={() => send(reply, threadMsg.id)}>返信</button>
          </div></div>
        </div>
      ) : null}
      {emoji ? (
        <div className="emoji-pop" style={{ left: Math.min(emoji.x, window.innerWidth - 330), top: emoji.y, position: 'fixed' }} onMouseDown={(e) => e.stopPropagation()}>
          {EMOJIS.map((em) => <span key={em} onClick={() => { if (emoji.id) react(emoji.id, em); else { setDraft((v) => v + em); setEmoji(null); } }}>{em}</span>)}
        </div>
      ) : null}
      {creating ? <NewChannel onClose={() => setCreating(false)} onCreate={async (name, desc) => {
        const row = await api<{ id: string }>('/api/channels', { method: 'POST', body: JSON.stringify({ name, desc }) });
        setCreating(false);
        await loadChannels();
        setCh(row.id);
      }} /> : null}
    </div>
  );
}

function Msg({ m, names, meId, inThread, onReact, onThread, onEmoji }: {
  m: ChatMessage; names: string[]; meId: string; inThread?: boolean;
  onReact: (id: string, em: string) => void; onThread: (id: string) => void;
  onEmoji: (e: React.MouseEvent, id: string) => void;
}) {
  const { member } = useGix();
  const u = member(m.userId);
  const when = (() => { const p = tokyoParts(new Date(m.ts)); return `${p.hour}:${p.minute}`; })();
  return (
    <div className="msg" id={`m-${m.id}`}>
      <Avatar member={u} />
      <div className="body">
        <b>{u.name}</b>{u.isBot ? <span className="badge">BOT</span> : null}<span className="meta">{when}</span>
        <div className="txt"><MessageText text={m.text} names={names} /></div>
        {m.attachments?.map((a) => a.mime.startsWith('image/')
          ? <a className="attach" key={a.id} href={`/api/files/${a.id}`} target="_blank" rel="noreferrer"><img src={`/api/files/${a.id}`} alt={a.filename} /></a>
          : <a className="badge b-m attach" key={a.id} href={`/api/files/${a.id}`} target="_blank" rel="noreferrer"><Icon name="clip" style={{ width: 12, height: 12 }} /> {a.filename}</a>)}
        {Object.entries(m.reactions || {}).filter(([, us]) => us.length).length ? (
          <div className="reacts">
            {Object.entries(m.reactions).filter(([, us]) => us.length).map(([em, us]) => (
              <span key={em} className={`react ${us.includes(meId) ? 'mine' : ''}`} title={us.map((id) => member(id).name).join(', ')} onClick={() => onReact(m.id, em)}>{em} {us.length}</span>
            ))}
          </div>
        ) : null}
        {!inThread && m.replies?.length ? (
          <span className="thread-link" onClick={() => onThread(m.id)}>💬 {m.replies.length}件の返信 ・ {timeAgo(m.replies[m.replies.length - 1].ts)}</span>
        ) : null}
      </div>
      <div className="msg-actions">
        <span onClick={(e) => onEmoji(e, m.id)}>😊</span>
        {inThread ? null : <span onClick={() => onThread(m.id)}><Icon name="reply" style={{ width: 15, height: 15 }} /></span>}
      </div>
    </div>
  );
}

function NewChannel({ onClose, onCreate }: { onClose: () => void; onCreate: (name: string, desc: string) => void }) {
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  return (
    <Modal title="チャンネルを作成" onClose={onClose} footer={<>
      <button className="btn" type="button" onClick={onClose}>キャンセル</button>
      <button className="btn primary" type="button" onClick={() => name.trim() && onCreate(name.trim(), desc)}>作成</button>
    </>}>
      <Field label="チャンネル名"><input className="in" value={name} placeholder="例: 年末特番PJ" onChange={(e) => setName(e.target.value)} /></Field>
      <Field label="説明"><input className="in" value={desc} onChange={(e) => setDesc(e.target.value)} /></Field>
    </Modal>
  );
}
