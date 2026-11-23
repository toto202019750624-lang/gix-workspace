'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
const DEMO_PASSWORD = 'gix2026';

const ACCOUNTS = [
  ['ちま', 'chima@gix.example', '社長'],
  ['GIX副社長Bot', 'vp@gix.example', '副社長'],
  ['佐藤 陽菜', 'sato@gix.example', '企画部 部長'],
  ['田中 大輝', 'tanaka@gix.example', '制作部 部長'],
  ['吉田 健太', 'yoshida@gix.example', '出向者'],
  ['加藤 葵', 'kato@gix.example', '一般'],
];

function LoginForm() {
  const router = useRouter();
  const sp = useSearchParams();
  const [email, setEmail] = useState('chima@gix.example');
  const [password, setPassword] = useState(DEMO_PASSWORD);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(nextEmail = email, nextPassword = password) {
    setBusy(true);
    setErr('');
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: nextEmail, password: nextPassword }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setErr(data.error || 'ログインできません'); return; }
    const next = sp.get('next');
    const dest = next && next.startsWith('/') && !next.startsWith('//') ? next : '/home';
    router.push(dest);
    router.refresh();
  }

  return (
    <div className="login-wrap">
      <div className="card login-card">
        <div className="brand" style={{ padding: 0 }}>
          <div className="logo">GIX</div>
          <div><b>GIX Workspace</b><small>株式会社GIX</small></div>
        </div>
        <h2>おかえりなさい</h2>
        <p className="muted" style={{ marginTop: 0 }}>埼玉のAI動画プロダクション、社内グループウェアです。</p>
        <form onSubmit={(e) => { e.preventDefault(); submit(); }} style={{ display: 'grid', gap: 12 }}>
          <div className="field"><label>メールアドレス</label><input className="in" value={email} autoComplete="username" onChange={(e) => setEmail(e.target.value)} /></div>
          <div className="field"><label>パスワード</label><input className="in" type="password" value={password} autoComplete="current-password" onChange={(e) => setPassword(e.target.value)} /></div>
          {err ? <div className="err">{err}</div> : null}
          <button className="btn primary" type="submit" disabled={busy}>{busy ? '確認中…' : 'ログイン'}</button>
        </form>
        <div className="nav-sep" style={{ paddingLeft: 0 }}>デモアカウント（パスワード {DEMO_PASSWORD}）</div>
        <div className="demo-grid">
          {ACCOUNTS.map(([name, mail, role]) => (
            <button key={mail} className="demo-acc" type="button" onClick={() => { setEmail(mail); setPassword(DEMO_PASSWORD); submit(mail, DEMO_PASSWORD); }}>
              <b>{name}</b>
              <span className="small muted">{role}</span>
            </button>
          ))}
        </div>
        <p className="faint small" style={{ marginBottom: 0 }}>設立 2026-11-23 ・ 本店 埼玉県 ・ 資本金 300万円</p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="login-wrap"><div className="muted">読み込み中…</div></div>}>
      <LoginForm />
    </Suspense>
  );
}
