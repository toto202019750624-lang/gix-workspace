import { execSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { beforeAll, expect, test } from 'vitest';

process.env.DATABASE_URL = 'file:/tmp/gix-vitest.db';
process.env.AUTH_SECRET = 'test-secret';
process.env.UPLOAD_DIR = '/tmp/gix-vitest-uploads';

type Handler = (req: Request, parts?: string[]) => Promise<Response>;
let handleApi: Handler;

function call(method: string, path: string, opts: { token?: string; json?: unknown; cookie?: string; form?: FormData } = {}) {
  const headers = new Headers();
  if (opts.token) headers.set('authorization', `Bearer ${opts.token}`);
  if (opts.cookie) headers.set('cookie', opts.cookie);
  let body: BodyInit | undefined;
  if (opts.form) body = opts.form;
  else if (opts.json !== undefined) {
    headers.set('content-type', 'application/json');
    body = JSON.stringify(opts.json);
  }
  const url = new URL('http://gix.local' + path);
  const parts = url.pathname.split('/').filter(Boolean).slice(1);
  return handleApi(new Request(url, { method, headers, body }), parts);
}

beforeAll(async () => {
  rmSync('/tmp/gix-vitest.db', { force: true });
  rmSync('/tmp/gix-vitest-uploads', { recursive: true, force: true });
  mkdirSync('/tmp/gix-vitest-uploads', { recursive: true });
  execSync('npx prisma db push --skip-generate --accept-data-loss', {
    stdio: 'pipe',
    env: process.env,
  });
  const mod = await import('./api');
  handleApi = mod.handleApi;
  const seed = await import('../lib/seed-run');
  await seed.seedDatabase({ reset: true });
}, 120000);

async function login(email: string) {
  const res = await call('POST', '/api/auth/login', { json: { email, password: 'gix2026' } });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.user.passwordHash).toBeUndefined();
  expect(body.token).toBeTruthy();
  const cookie = res.headers.get('set-cookie') || '';
  expect(cookie).toContain('gix_session=');
  return { token: body.token as string, cookie, user: body.user };
}

test('seeded ceo sees personal counts and scoped approvals', async () => {
  const chima = await login('chima@gix.example');
  const boot = await (await call('GET', '/api/bootstrap', { token: chima.token })).json();
  expect(boot.me.name).toBe('ちま');
  expect(boot.me.role).toBe('ceo');
  expect(boot.members).toHaveLength(21);
  expect(boot.company).toMatchObject({ founded: '2026-11-23', hq: '埼玉県', capitalYen: 3000000 });
  expect(boot.counts).toMatchObject({ messages: 7, approvals: 3, tasks: 1 });
  expect(boot.clockedIn).toBeNull();

  const pending = await (await call('GET', '/api/approvals?tab=pending', { token: chima.token })).json();
  expect(pending.map((a: { title: string }) => a.title)).toEqual([
    '撮影機材（シネマカメラ）購入',
    '川越ロケ 交通費・駐車場',
    '年末特番 制作予算',
  ]);

  const tanaka = await login('tanaka@gix.example');
  const tanakaPending = await (await call('GET', '/api/approvals?tab=pending', { token: tanaka.token })).json();
  expect(tanakaPending.map((a: { title: string }) => a.title)).toEqual(['午前休 11/27']);
  const denied = await call('POST', '/api/approvals/ap-camera/decide', { token: tanaka.token, json: { decision: 'approved' } });
  expect(denied.status).toBe(403);

  const kato = await login('kato@gix.example');
  const visible = await (await call('GET', '/api/approvals?tab=all', { token: kato.token })).json();
  const titles = visible.map((a: { title: string }) => a.title);
  expect(titles).toContain('午前休 11/27');
  expect(titles).not.toContain('年末特番 制作予算');
  expect(titles).not.toContain('川越ロケ 交通費・駐車場');
});

test('multi-step approval, messenger, mentions, and attachments', async () => {
  const kobayashi = await login('kobayashi@gix.example');
  const created = await (await call('POST', '/api/approvals', {
    token: kobayashi.token,
    json: { type: '経費', title: '予備バッテリー', amount: 12000, approverIds: ['saito', 'chima'], note: 'ロケ予備' },
  })).json();
  expect(created.currentApproverId).toBe('saito');
  expect(created.status).toBe('pending');

  const chima = await login('chima@gix.example');
  const tooEarly = await call('POST', `/api/approvals/${created.id}/decide`, { token: chima.token, json: { decision: 'approved' } });
  expect(tooEarly.status).toBe(403);

  const saito = await login('saito@gix.example');
  const mid = await (await call('POST', `/api/approvals/${created.id}/decide`, { token: saito.token, json: { decision: 'approved' } })).json();
  expect(mid.status).toBe('pending');
  expect(mid.currentApproverId).toBe('chima');

  const done = await (await call('POST', `/api/approvals/${created.id}/decide`, { token: chima.token, json: { decision: 'approved' } })).json();
  expect(done.status).toBe('approved');

  const sato = await login('sato@gix.example');
  const posted = await (await call('POST', '/api/channels/general/messages', {
    token: sato.token,
    json: { text: '@ちま 企画の件、確認お願いします' },
  })).json();
  expect(posted.text).toContain('@ちま');

  const msgs = await (await call('GET', '/api/channels/general/messages', { cookie: chima.cookie })).json();
  expect(msgs.some((m: { text: string }) => m.text.includes('確認お願いします'))).toBe(true);

  const notes = await (await call('GET', '/api/notifications', { token: chima.token })).json();
  expect(notes.some((n: { text: string }) => n.text.includes('佐藤 陽菜') && n.text.includes('メンション'))).toBe(true);

  const fd = new FormData();
  fd.set('file', new File(['gix-memo'], 'memo.txt', { type: 'text/plain' }));
  const uploaded = await (await call('POST', '/api/upload', { token: sato.token, form: fd })).json();
  const withFile = await (await call('POST', '/api/channels/plan/messages', {
    token: sato.token,
    json: { text: '台本添付します', attachmentIds: [uploaded.id] },
  })).json();
  expect(withFile.attachments[0].filename).toBe('memo.txt');
  const file = await call('GET', `/api/files/${uploaded.id}`, { token: chima.token });
  expect(file.status).toBe(200);
  expect(await file.text()).toBe('gix-memo');
});

test('bot replies in a direct message and attendance is per user', async () => {
  const chima = await login('chima@gix.example');
  await call('POST', '/api/channels/dm-vp/messages', { token: chima.token, json: { text: '承認状況は？' } });
  let reply = '';
  for (let i = 0; i < 20 && !reply; i++) {
    await new Promise((r) => setTimeout(r, 150));
    const msgs = await (await call('GET', '/api/channels/dm-vp/messages', { token: chima.token })).json();
    const hit = msgs.find((m: { userId: string; text: string }) => m.userId === 'vp' && m.text.includes('承認待ち'));
    if (hit) reply = hit.text;
  }
  expect(reply).toContain('承認待ち');

  const inn = await (await call('POST', '/api/attendance', { token: chima.token, json: { action: 'in' } })).json();
  expect(inn.clockedIn.inTime).toMatch(/^\d{2}:\d{2}$/);
  const sato = await login('sato@gix.example');
  const satoBoot = await (await call('GET', '/api/bootstrap', { token: sato.token })).json();
  expect(satoBoot.clockedIn).toBeNull();
  const forbidden = await call('GET', '/api/attendance?userId=chima', { token: sato.token });
  expect(forbidden.status).toBe(403);
  const own = await (await call('GET', '/api/attendance', { token: sato.token })).json();
  expect(own.every((r: { date: string }) => r.date !== satoBoot.me && true)).toBe(true);
  expect(own.some((r: { outTime: string | null }) => r.outTime)).toBe(true);
});
