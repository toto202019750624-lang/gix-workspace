'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { fmtMD } from '@/lib/dates';
import { api } from '@/lib/http';
import { md } from '@/lib/markdown';
import type { Attachment, Doc, Folder } from '@/lib/types';
import { Icon } from '../icons';
import { useGix } from '../Shell';
import { Avatar, Field, Modal } from '../ui';

export function DocsView() {
  const { member, me, toast } = useGix();
  const sp = useSearchParams();
  const [folders, setFolders] = useState<Folder[]>([]);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [id, setId] = useState(sp.get('doc') || 'd1');
  const [mode, setMode] = useState<'edit' | 'split' | 'preview'>('split');
  const [body, setBody] = useState('');
  const [title, setTitle] = useState('');
  const dirty = useRef(false);
  const [folderModal, setFolderModal] = useState(false);
  const load = useCallback(async () => {
    const [f, d] = await Promise.all([api<Folder[]>('/api/folders'), api<Doc[]>('/api/docs')]);
    setFolders(f);
    setDocs(d);
    return d;
  }, []);
  useEffect(() => { load().catch(() => undefined); }, [load]);
  const doc = docs.find((d) => d.id === id) || docs[0];
  useEffect(() => {
    if (!doc) return;
    if (doc.id !== id) setId(doc.id);
    dirty.current = false;
    setBody(doc.body);
    setTitle(doc.title);
  }, [doc?.id]);
  const created = useRef(false);
  useEffect(() => {
    const wanted = sp.get('doc');
    if (wanted) setId(wanted);
    if (sp.get('new') === '1' && !created.current) {
      created.current = true;
      api<Doc>('/api/docs', { method: 'POST', body: JSON.stringify({}) }).then((d) => { setId(d.id); load(); }).catch(() => undefined);
    }
  }, [sp, load]);
  useEffect(() => {
    if (!doc || !dirty.current) return;
    const t = setTimeout(() => {
      api('/api/docs/' + doc.id, { method: 'PATCH', body: JSON.stringify({ body, title }) }).catch(() => undefined);
    }, 500);
    return () => clearTimeout(t);
  }, [body, title]);

  async function toggleFolder(f: Folder) {
    await api('/api/folders/' + f.id, { method: 'PATCH', body: JSON.stringify({ open: !f.open }) });
    load();
  }
  async function remove() {
    if (!doc || !confirm('このドキュメントを削除しますか？')) return;
    await api('/api/docs/' + doc.id, { method: 'DELETE' });
    setId(docs.find((d) => d.id !== doc.id)?.id || '');
    toast('削除しました');
    load();
  }
  async function attach(file: File) {
    if (!doc) return;
    const fd = new FormData();
    fd.set('file', file);
    const att = await api<Attachment>('/api/upload', { method: 'POST', body: fd });
    await api('/api/docs/' + doc.id + '/attach', { method: 'POST', body: JSON.stringify({ attachmentId: att.id }) });
    load();
  }

  if (!doc) {
    return (
      <div className="card" style={{ padding: 28 }}>
        <div className="empty">ドキュメントはまだありません</div>
        <div style={{ textAlign: 'center' }}>
          <button className="btn primary" type="button" onClick={async () => { const d = await api<Doc>('/api/docs', { method: 'POST', body: JSON.stringify({}) }); setId(d.id); load(); }}><Icon name="plus" /> 新規ドキュメント</button>
        </div>
      </div>
    );
  }
  return (
    <div className="docs">
      <div className="card tree">
        <div className="row" style={{ marginBottom: 10 }}>
          <b>Wiki</b>
          <button className="btn sm" style={{ marginLeft: 'auto' }} type="button" onClick={async () => { const d = await api<Doc>('/api/docs', { method: 'POST', body: JSON.stringify({}) }); setId(d.id); setMode('split'); load(); }}><Icon name="plus" style={{ width: 13 }} /> 新規</button>
          <button className="btn sm" type="button" onClick={() => setFolderModal(true)}><Icon name="folder" style={{ width: 13 }} /></button>
        </div>
        {folders.map((f) => (
          <div key={f.id}>
            <div className="folder" onClick={() => toggleFolder(f)}>
              <span className="faint" style={{ transform: `rotate(${f.open ? '-90deg' : '180deg'})`, display: 'inline-flex' }}><Icon name="chev" style={{ width: 12 }} /></span>
              📁 {f.name}<span className="faint small" style={{ marginLeft: 'auto' }}>{docs.filter((d) => d.folderId === f.id).length}</span>
            </div>
            {f.open ? docs.filter((d) => d.folderId === f.id).map((d) => (
              <div key={d.id} className={`doc-item ${d.id === doc.id ? 'on' : ''}`} onClick={() => setId(d.id)}>📄 {d.title}</div>
            )) : null}
          </div>
        ))}
      </div>
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0 }}>
        <div className="row">
          <input className="in" style={{ fontSize: 18, fontWeight: 700, background: 'transparent', borderColor: 'transparent' }} value={title} onChange={(e) => { dirty.current = true; setTitle(e.target.value); }} />
          <div className="seg">
            {([['edit', '編集'], ['split', '分割'], ['preview', 'プレビュー']] as const).map(([k, l]) => <button key={k} className={mode === k ? 'on' : ''} type="button" onClick={() => setMode(k)}>{l}</button>)}
          </div>
          <button className="icon-btn" title="削除" type="button" onClick={remove}><Icon name="trash" /></button>
        </div>
        <div className="row small muted">
          <Avatar member={member(doc.updatedBy)} size="sm" /> {member(doc.updatedBy).name} ・ 最終更新 {fmtMD(doc.updatedOn)}{doc.viaAi ? <span className="badge">AI</span> : null} ・
          <select className="in" style={{ width: 'auto', padding: '3px 8px' }} value={doc.folderId} onChange={async (e) => { await api('/api/docs/' + doc.id, { method: 'PATCH', body: JSON.stringify({ folderId: e.target.value }) }); load(); }}>
            {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
          <label className="btn sm" style={{ marginLeft: 'auto' }}>
            <Icon name="clip" style={{ width: 13 }} /> 添付
            <input type="file" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) attach(f).catch((err) => toast(err.message)); e.target.value = ''; }} />
          </label>
        </div>
        {doc.attachments?.length ? <div>{doc.attachments.map((a) => <a key={a.id} className="badge b-m attach" href={`/api/files/${a.id}`} target="_blank" rel="noreferrer">{a.filename}</a>)}</div> : null}
        <div className={`editor ${mode === 'edit' ? 'only-edit' : mode === 'preview' ? 'only-prev' : ''}`} style={{ flex: 1 }}>
          {mode !== 'preview' ? <textarea spellCheck={false} value={body} onChange={(e) => { dirty.current = true; setBody(e.target.value); }} /> : null}
          {mode !== 'edit' ? <div className="md" dangerouslySetInnerHTML={{ __html: md(body) }} /> : null}
        </div>
      </div>
      {folderModal ? <NewFolder onClose={() => setFolderModal(false)} onCreate={async (name) => { await api('/api/folders', { method: 'POST', body: JSON.stringify({ name }) }); setFolderModal(false); load(); }} /> : null}
      <span style={{ display: 'none' }}>{me.id}</span>
    </div>
  );
}

function NewFolder({ onClose, onCreate }: { onClose: () => void; onCreate: (name: string) => void }) {
  const [name, setName] = useState('');
  return (
    <Modal title="フォルダを作成" onClose={onClose} footer={<><button className="btn" type="button" onClick={onClose}>キャンセル</button><button className="btn primary" type="button" onClick={() => name.trim() && onCreate(name.trim())}>作成</button></>}>
      <Field label="フォルダ名"><input className="in" value={name} onChange={(e) => setName(e.target.value)} /></Field>
    </Modal>
  );
}
