import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { db } from '../lib/prisma';
import { verifyPassword } from '../lib/password';
import { ROLE_LABEL } from '../lib/format';
import { applyDecision, canSeeApproval, currentApproverId } from '../lib/approvals';
import { extractMentions } from '../lib/mentions';
import { hmNow, hmToMinutes, todayYMD } from '../lib/dates';
import { bus, publish } from './bus';
import { answerQuestion } from './ai';
import { seedDatabase } from '../lib/seed-run';

type DeptUser = NonNullable<Awaited<ReturnType<typeof loadUser>>>;

function json(data: unknown, status = 200) {
  return Response.json(data, { status });
}
function err(message: string, status = 400) {
  return json({ error: message }, status);
}
async function readBody(req: Request) {
  const text = await req.text();
  if (!text) return {} as Record<string, unknown>;
  try { return JSON.parse(text) as Record<string, unknown>; } catch { return {} as Record<string, unknown>; }
}
function tokenFrom(req: Request) {
  const auth = req.headers.get('authorization') || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
  const cookie = req.headers.get('cookie') || '';
  const m = cookie.match(/(?:^|;\s*)gix_session=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}
function withCookie(res: Response, token: string, maxAge: number) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.headers.append('Set-Cookie', `gix_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`);
  return res;
}
function match(parts: string[], pattern: string) {
  const want = pattern.split('/');
  if (want.length !== parts.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < want.length; i++) {
    if (want[i].startsWith(':')) params[want[i].slice(1)] = parts[i];
    else if (want[i] !== parts[i]) return null;
  }
  return params;
}
function str(v: unknown, max = 500) {
  return String(v ?? '').slice(0, max);
}
function uploadRoot() {
  return path.resolve(process.env.UPLOAD_DIR || path.join(process.cwd(), 'data', 'uploads'));
}

async function loadUser(id: string) {
  return db().user.findUnique({ where: { id }, include: { dept: true } });
}
async function getUser(req: Request) {
  const token = tokenFrom(req);
  if (!token) return null;
  const session = await db().session.findUnique({ where: { token } });
  if (!session || session.expiresAt.getTime() < Date.now()) return null;
  return loadUser(session.userId);
}

function publicMember(u: DeptUser) {
  let skills: string[] = [];
  try { skills = JSON.parse(u.skills || '[]'); } catch { skills = []; }
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    deptId: u.deptId,
    deptName: u.dept?.name ?? '',
    deptColor: u.dept?.color ?? '#888888',
    role: u.role,
    roleLabel: ROLE_LABEL[u.role] || u.role,
    title: u.title,
    skills,
    bio: u.bio,
    ext: u.ext,
    status: u.status,
    grad: u.grad,
    isBot: u.isBot,
    theme: u.theme,
    sidebarCollapsed: u.sidebarCollapsed,
  };
}

function groupReactions(list: { emoji: string; userId: string }[]) {
  const o: Record<string, string[]> = {};
  for (const r of list) (o[r.emoji] ||= []).push(r.userId);
  return o;
}
function mapAtt(a: { id: string; filename: string; mime: string; size: number }) {
  return { id: a.id, filename: a.filename, mime: a.mime, size: a.size };
}
type MsgJson = {
  id: string; channelId: string; userId: string; text: string; ts: string;
  reactions: Record<string, string[]>;
  attachments: { id: string; filename: string; mime: string; size: number }[];
  replies: MsgJson[];
};
function mapMessage(m: {
  id: string; channelId: string; userId: string; text: string; createdAt: Date;
  reactions?: { emoji: string; userId: string }[];
  attachments?: { id: string; filename: string; mime: string; size: number }[];
  replies?: Parameters<typeof mapMessage>[0][];
}): MsgJson {
  return {
    id: m.id,
    channelId: m.channelId,
    userId: m.userId,
    text: m.text,
    ts: m.createdAt.toISOString(),
    reactions: groupReactions(m.reactions || []),
    attachments: (m.attachments || []).map(mapAtt),
    replies: (m.replies || []).map((r) => mapMessage(r)),
  };
}

const msgInclude = {
  reactions: true,
  attachments: { select: { id: true, filename: true, mime: true, size: true } },
  replies: {
    orderBy: { createdAt: 'asc' as const },
    include: {
      reactions: true,
      attachments: { select: { id: true, filename: true, mime: true, size: true } },
    },
  },
};

async function notify(userId: string, data: { icon: string; text: string; go?: string }) {
  const row = await db().notification.create({
    data: {
      id: randomUUID(),
      userId,
      icon: data.icon,
      text: data.text,
      go: data.go || '',
      read: false,
      createdAt: new Date(),
    },
  });
  publish({ type: 'notification', userId });
  return row;
}

async function unreadMap(userId: string) {
  const memberships = await db().channelMember.findMany({ where: { userId }, select: { channelId: true } });
  const ids = memberships.map((m) => m.channelId);
  const reads = await db().channelRead.findMany({ where: { userId } });
  const readAt = new Map(reads.map((r) => [r.channelId, r.lastReadAt]));
  const msgs = ids.length
    ? await db().message.findMany({
        where: { channelId: { in: ids }, parentId: null, NOT: { userId } },
        select: { channelId: true, createdAt: true },
      })
    : [];
  const map: Record<string, number> = {};
  for (const m of msgs) {
    const lr = readAt.get(m.channelId) ?? new Date(0);
    if (m.createdAt > lr) map[m.channelId] = (map[m.channelId] || 0) + 1;
  }
  return map;
}

async function countsFor(userId: string) {
  const map = await unreadMap(userId);
  const messages = Object.values(map).reduce((a, b) => a + b, 0);
  const approvals = await db().approvalStep.count({ where: { approverId: userId, status: 'pending' } });
  const tasks = await db().task.count({ where: { assigneeId: userId, status: { not: 'done' } } });
  return { messages, approvals, tasks, byChannel: map };
}

function mapTask(t: {
  id: string; title: string; status: string; assigneeId: string; creatorId: string;
  start: string; due: string; priority: string; tag: string;
  subtasks: { id: string; title: string; done: boolean; sort: number }[];
}) {
  return {
    id: t.id, title: t.title, status: t.status, assigneeId: t.assigneeId, creatorId: t.creatorId,
    start: t.start, due: t.due, priority: t.priority, tag: t.tag,
    subtasks: t.subtasks.slice().sort((a, b) => a.sort - b.sort).map((s) => ({ id: s.id, title: s.title, done: s.done })),
  };
}
function mapEvent(e: {
  id: string; title: string; date: string; start: string; end: string; color: string; place: string; desc: string;
  attendees: { userId: string }[];
}) {
  return {
    id: e.id, title: e.title, date: e.date, start: e.start, end: e.end, color: e.color, place: e.place, desc: e.desc,
    attendees: e.attendees.map((a) => a.userId),
  };
}
function mapApproval(a: {
  id: string; type: string; title: string; amount: number; requesterId: string; date: string; status: string; note: string;
  steps: { id: string; approverId: string; position: number; status: string; decidedAt: Date | null }[];
}) {
  const steps = a.steps.slice().sort((x, y) => x.position - y.position).map((s) => ({
    id: s.id, approverId: s.approverId, order: s.position, status: s.status,
    decidedAt: s.decidedAt ? s.decidedAt.toISOString() : null,
  }));
  return {
    id: a.id, type: a.type, title: a.title, amount: a.amount, requesterId: a.requesterId,
    date: a.date, status: a.status, note: a.note, steps,
    currentApproverId: currentApproverId(a.steps),
  };
}

async function markRead(channelId: string, userId: string) {
  await db().channelRead.upsert({
    where: { channelId_userId: { channelId, userId } },
    create: { channelId, userId, lastReadAt: new Date() },
    update: { lastReadAt: new Date() },
  });
}

async function linkAttachments(ids: string[], userId: string, target: { messageId?: string; docId?: string }) {
  if (!ids.length) return;
  const rows = await db().attachment.findMany({ where: { id: { in: ids }, userId, messageId: null, docId: null } });
  if (rows.length !== ids.length) throw new Error('添付ファイルを確認できません');
  await db().attachment.updateMany({ where: { id: { in: ids } }, data: target });
}

async function afterMessage(channelId: string, sender: DeptUser, text: string) {
  const channel = await db().channel.findUnique({ where: { id: channelId }, include: { members: true } });
  if (!channel) return;
  const members = await db().user.findMany({ select: { id: true, name: true, isBot: true } });
  const mentioned = extractMentions(text, members);
  const targets = (mentioned.all ? members.filter((m) => !m.isBot).map((m) => m.id) : mentioned.ids).filter((id) => id !== sender.id);
  const label = channel.kind === 'dm' ? 'DM' : `#${channel.name}`;
  for (const id of targets) {
    await notify(id, { icon: 'chat', text: `${sender.name}さんがあなたをメンションしました（${label}）`, go: 'messenger' });
  }
  if (channel.kind === 'dm') {
    for (const m of channel.members) {
      if (m.userId !== sender.id && !targets.includes(m.userId)) {
        const other = members.find((x) => x.id === m.userId);
        if (other && !other.isBot) await notify(m.userId, { icon: 'chat', text: `${sender.name}さんからダイレクトメッセージ`, go: 'messenger' });
      }
    }
    const bot = members.find((m) => channel.members.some((cm) => cm.userId === m.id) && m.isBot && m.id !== sender.id);
    if (bot) scheduleBot(channelId, sender, bot.id, text);
  }
  publish({ type: 'message', channelId, userId: sender.id });
}

function scheduleBot(channelId: string, sender: DeptUser, botId: string, text: string) {
  setTimeout(() => {
    void (async () => {
      const openTasks = await db().task.count({ where: { assigneeId: sender.id, status: { not: 'done' } } });
      const pending = await db().approvalStep.count({ where: { approverId: sender.id, status: 'pending' } });
      const honor = sender.role === 'ceo' ? '社長' : `${sender.name}さん`;
      let reply = `かしこまりました、${honor}。副社長として対応します。進捗はこのDMで報告しますね。`;
      if (/タスク/.test(text)) reply = `${honor}の未完了タスクは${openTasks}件です。期限が近いものから整理しておきます。`;
      else if (/承認|稟議/.test(text)) reply = `承認待ちは${pending}件です。金額の大きいものから確認するのがおすすめです。`;
      await db().message.create({ data: { id: randomUUID(), channelId, userId: botId, text: reply, createdAt: new Date() } });
      publish({ type: 'message', channelId, userId: botId });
      await notify(sender.id, { icon: 'chat', text: 'GIX副社長Botから新着メッセージ', go: 'messenger' });
    })().catch((e) => console.error(e));
  }, 600);
}

async function listApprovals(user: DeptUser) {
  const rows = await db().approval.findMany({
    include: { steps: true, requester: true },
    orderBy: { createdAt: 'desc' },
  });
  return rows.map((a) => ({
    row: a,
    mapped: mapApproval(a),
    visible: canSeeApproval(
      { id: user.id, role: user.role, deptId: user.deptId },
      { requesterId: a.requesterId, requesterDeptId: a.requester.deptId, status: a.status, steps: a.steps },
    ),
  }));
}

export async function handleApi(req: Request, partsIn: string[] = []) {
  const parts = partsIn.filter(Boolean).map((p) => { try { return decodeURIComponent(p); } catch { return p; } });
  const url = new URL(req.url);
  const method = req.method.toUpperCase();
  try {
    if (method === 'GET' && parts[0] === 'health') return json({ ok: true, service: 'gix-workspace' });
    if (method === 'POST' && match(parts, 'auth/login')) return login(req);
    if (method === 'POST' && match(parts, 'auth/logout')) return logout(req);
    const user = await getUser(req);
    if (!user) return err('unauthorized', 401);
    return await route(req, method, parts, url, user);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'サーバーエラー';
    if (message === '添付ファイルを確認できません') return err(message, 400);
    console.error(e);
    return err('サーバーエラー', 500);
  }
}

async function login(req: Request) {
  const body = await readBody(req);
  const email = str(body.email, 200).trim().toLowerCase();
  const password = String(body.password ?? '');
  const user = await db().user.findUnique({ where: { email }, include: { dept: true } });
  if (!user || !verifyPassword(password, user.passwordHash)) return err('メールアドレスまたはパスワードが違います', 401);
  const token = randomBytes(32).toString('hex');
  await db().session.create({ data: { token, userId: user.id, expiresAt: new Date(Date.now() + 30 * 864e5) } });
  const res = json({ user: publicMember(user), token });
  return withCookie(res, token, 60 * 60 * 24 * 30);
}
async function logout(req: Request) {
  const token = tokenFrom(req);
  if (token) await db().session.deleteMany({ where: { token } });
  return withCookie(json({ ok: true }), '', 0);
}

async function route(req: Request, method: string, parts: string[], url: URL, user: DeptUser) {
  const path = parts.join('/');
  if (method === 'GET' && path === 'bootstrap') return bootstrap(user);
  if (method === 'GET' && path === 'stream') return stream(user);
  if (method === 'PATCH' && path === 'me') return patchMe(req, user);
  if (method === 'GET' && path === 'search') return search(user, url.searchParams.get('q') || '');
  if (method === 'POST' && path === 'ai') return ai(req, user);
  if (method === 'POST' && path === 'admin/reset') return reset(user);
  if (method === 'POST' && path === 'upload') return upload(req, user);
  if (method === 'GET' && match(parts, 'files/:id')) return download(match(parts, 'files/:id')!.id, user);

  if (path === 'announcements' && method === 'GET') {
    const rows = await db().announcement.findMany({ orderBy: { createdAt: 'desc' } });
    return json(rows.map((a) => ({ id: a.id, title: a.title, body: a.body, authorId: a.authorId, date: a.date, pin: a.pin, tag: a.tag })));
  }
  if (path === 'announcements' && method === 'POST') return createAnnouncement(req, user);

  if (path === 'channels' && method === 'GET') return listChannels(user);
  if (path === 'channels' && method === 'POST') return createChannel(req, user);
  const chMsg = match(parts, 'channels/:id/messages');
  if (chMsg && method === 'GET') return listMessages(user, chMsg.id, url.searchParams.get('q') || '');
  if (chMsg && method === 'POST') return postMessage(req, user, chMsg.id);
  const chRead = match(parts, 'channels/:id/read');
  if (chRead && method === 'POST') {
    if (!(await db().channelMember.findUnique({ where: { channelId_userId: { channelId: chRead.id, userId: user.id } } }))) return err('チャンネルがありません', 404);
    await markRead(chRead.id, user.id);
    return json({ ok: true });
  }
  const react = match(parts, 'messages/:id/reactions');
  if (react && method === 'POST') return toggleReaction(req, user, react.id);

  if (path === 'calendar' && method === 'GET') {
    const rows = await db().calendarEvent.findMany({ include: { attendees: true }, orderBy: [{ date: 'asc' }, { start: 'asc' }] });
    return json(rows.map(mapEvent));
  }
  if (path === 'calendar' && method === 'POST') return saveEvent(req, user, null);
  const ev = match(parts, 'calendar/:id');
  if (ev && method === 'PATCH') return saveEvent(req, user, ev.id);
  if (ev && method === 'DELETE') {
    await db().calendarEvent.delete({ where: { id: ev.id } }).catch(() => null);
    return json({ ok: true });
  }

  if (path === 'tasks' && method === 'GET') {
    const rows = await db().task.findMany({ include: { subtasks: true }, orderBy: { sort: 'asc' } });
    return json(rows.map(mapTask));
  }
  if (path === 'tasks' && method === 'POST') return saveTask(req, user, null);
  const tk = match(parts, 'tasks/:id');
  if (tk && method === 'PATCH') return saveTask(req, user, tk.id);
  if (tk && method === 'DELETE') {
    await db().task.delete({ where: { id: tk.id } }).catch(() => null);
    publish({ type: 'task' });
    return json({ ok: true });
  }

  if (path === 'folders' && method === 'GET') return json(await db().folder.findMany({ orderBy: { sort: 'asc' } }));
  if (path === 'folders' && method === 'POST') {
    const body = await readBody(req);
    const name = str(body.name, 80).trim();
    if (!name) return err('フォルダ名を入力してください');
    const sort = await db().folder.count();
    const row = await db().folder.create({ data: { id: randomUUID(), name, open: true, sort } });
    return json(row);
  }
  const folder = match(parts, 'folders/:id');
  if (folder && method === 'PATCH') {
    const body = await readBody(req);
    const row = await db().folder.update({ where: { id: folder.id }, data: { open: body.open === undefined ? undefined : !!body.open, name: body.name ? str(body.name, 80) : undefined } });
    return json(row);
  }

  if (path === 'docs' && method === 'GET') {
    const rows = await db().doc.findMany({ include: { attachments: { select: { id: true, filename: true, mime: true, size: true } } } });
    return json(rows.map((d) => ({ id: d.id, folderId: d.folderId, title: d.title, body: d.body, updatedBy: d.updatedBy, updatedOn: d.updatedOn, attachments: d.attachments.map(mapAtt) })));
  }
  if (path === 'docs' && method === 'POST') return saveDoc(req, user, null);
  const docAtt = match(parts, 'docs/:id/attach');
  if (docAtt && method === 'POST') {
    const body = await readBody(req);
    const doc = await db().doc.findUnique({ where: { id: docAtt.id } });
    if (!doc) return err('ドキュメントがありません', 404);
    await linkAttachments([str(body.attachmentId, 80)], user.id, { docId: doc.id });
    return json({ ok: true });
  }
  const doc = match(parts, 'docs/:id');
  if (doc && method === 'PATCH') return saveDoc(req, user, doc.id);
  if (doc && method === 'DELETE') {
    const atts = await db().attachment.findMany({ where: { docId: doc.id } });
    for (const a of atts) await unlink(a.path).catch(() => undefined);
    await db().attachment.deleteMany({ where: { docId: doc.id } });
    await db().doc.delete({ where: { id: doc.id } }).catch(() => null);
    return json({ ok: true });
  }

  if (path === 'base' && method === 'GET') {
    const rows = await db().baseRow.findMany({ orderBy: { sort: 'asc' } });
    return json(rows);
  }
  if (path === 'base' && method === 'POST') return saveBase(req, user, null);
  const base = match(parts, 'base/:id');
  if (base && method === 'PATCH') return saveBase(req, user, base.id);
  if (base && method === 'DELETE') {
    await db().baseRow.delete({ where: { id: base.id } }).catch(() => null);
    return json({ ok: true });
  }

  if (path === 'approvals' && method === 'GET') {
    const tab = url.searchParams.get('tab') || 'all';
    const all = await listApprovals(user);
    const filtered = all.filter((a) => {
      if (tab === 'pending') return a.mapped.currentApproverId === user.id && a.mapped.status === 'pending';
      if (tab === 'mine') return a.mapped.requesterId === user.id;
      if (tab === 'done') return a.mapped.status !== 'pending' && a.visible;
      return a.visible;
    });
    return json(filtered.map((a) => a.mapped));
  }
  if (path === 'approvals' && method === 'POST') return createApproval(req, user);
  const decide = match(parts, 'approvals/:id/decide');
  if (decide && method === 'POST') return decideApproval(req, user, decide.id);

  if (path === 'meetings' && method === 'GET') {
    const rows = await db().meeting.findMany({ include: { attendees: true } });
    return json(rows.map((m) => ({ id: m.id, title: m.title, date: m.date, time: m.time, status: m.status, minutes: m.minutes, attendees: m.attendees.map((a) => a.userId) })));
  }
  if (path === 'meetings' && method === 'POST') return saveMeeting(req, user, null);
  const mt = match(parts, 'meetings/:id');
  if (mt && method === 'PATCH') return saveMeeting(req, user, mt.id);

  if (path === 'attendance' && method === 'GET') return getAttendance(user, url.searchParams.get('userId'));
  if (path === 'attendance' && method === 'POST') return clock(req, user);

  if (path === 'okrs' && method === 'GET') {
    const rows = await db().okr.findMany({ include: { krs: true } });
    return json(rows.map((o) => ({
      id: o.id, ownerId: o.ownerId, objective: o.objective,
      krs: o.krs.sort((a, b) => a.sort - b.sort).map((k) => ({ id: k.id, title: k.title, current: k.current, target: k.target, inverse: k.inverse })),
    })));
  }
  if (path === 'okrs' && method === 'POST') return createOkr(req, user);
  const okr = match(parts, 'okrs/:id');
  if (okr && method === 'PATCH') return patchOkr(req, user, okr.id);

  if (path === 'notifications' && method === 'GET') {
    const rows = await db().notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 40 });
    return json(rows.map(mapNote));
  }
  if (path === 'notifications/read' && method === 'POST') return readNotes(req, user);

  return err('not found', 404);
}

function mapNote(n: { id: string; icon: string; text: string; read: boolean; go: string; createdAt: Date }) {
  return { id: n.id, icon: n.icon, text: n.text, read: n.read, go: n.go, ts: n.createdAt.toISOString() };
}

async function bootstrap(user: DeptUser) {
  const [members, departments, company, notifications, counts, todayRow] = await Promise.all([
    db().user.findMany({ include: { dept: true }, orderBy: { ext: 'asc' } }),
    db().department.findMany({ orderBy: { sort: 'asc' } }),
    db().company.findUnique({ where: { id: 'gix' } }),
    db().notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 40 }),
    countsFor(user.id),
    db().attendance.findUnique({ where: { userId_date: { userId: user.id, date: todayYMD() } } }),
  ]);
  return json({
    me: publicMember(user),
    members: members.map(publicMember),
    departments,
    company: company ? { name: company.name, founded: company.founded, hq: company.hq, capitalYen: company.capitalYen } : null,
    notifications: notifications.map(mapNote),
    counts: { messages: counts.messages, approvals: counts.approvals, tasks: counts.tasks },
    clockedIn: todayRow && !todayRow.outTime ? { inTime: todayRow.inTime } : null,
  });
}

function stream(user: DeptUser) {
  const encoder = new TextEncoder();
  let cleanup = () => {};
  const body = new ReadableStream({
    start(controller) {
      const send = (obj: unknown) => {
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`)); } catch { /* closed */ }
      };
      send({ type: 'hello' });
      const handler = (ev: { type: string; userId?: string; channelId?: string }) => {
        if (ev.type === 'notification' && ev.userId && ev.userId !== user.id) return;
        send({ type: ev.type, channelId: ev.channelId, userId: ev.userId });
      };
      bus.on('gix', handler);
      const iv = setInterval(() => {
        try { controller.enqueue(encoder.encode(`: ping\n\n`)); } catch { /* closed */ }
      }, 15000);
      cleanup = () => { bus.off('gix', handler); clearInterval(iv); };
    },
    cancel() { cleanup(); },
  });
  return new Response(body, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
async function patchMe(req: Request, user: DeptUser) {
  const body = await readBody(req);
  const data: { theme?: string; sidebarCollapsed?: boolean; status?: string } = {};
  if (body.theme === 'light' || body.theme === 'dark') data.theme = body.theme;
  if (typeof body.sidebarCollapsed === 'boolean') data.sidebarCollapsed = body.sidebarCollapsed;
  if (typeof body.status === 'string' && ['online', 'away', 'busy', 'offline'].includes(body.status)) data.status = body.status;
  const updated = await db().user.update({ where: { id: user.id }, data, include: { dept: true } });
  return json({ me: publicMember(updated) });
}

async function search(user: DeptUser, qRaw: string) {
  const q = qRaw.trim().toLowerCase();
  const has = (s: string) => s.toLowerCase().includes(q);
  if (!q) return json({ members: [], tasks: [], docs: [], events: [], base: [], messages: [], approvals: [] });
  const [members, tasks, docs, events, base, approvals, memberships] = await Promise.all([
    db().user.findMany({ include: { dept: true } }),
    db().task.findMany(),
    db().doc.findMany(),
    db().calendarEvent.findMany(),
    db().baseRow.findMany(),
    listApprovals(user),
    db().channelMember.findMany({ where: { userId: user.id }, select: { channelId: true } }),
  ]);
  const channelIds = memberships.map((m) => m.channelId);
  const messages = await db().message.findMany({ where: { channelId: { in: channelIds }, parentId: null }, orderBy: { createdAt: 'desc' }, take: 200 });
  const channels = await db().channel.findMany({ where: { id: { in: channelIds } } });
  const chName = new Map(channels.map((c) => [c.id, c.name]));
  return json({
    members: members.filter((m) => has(m.name + m.title + (m.dept?.name || '') + m.skills)).slice(0, 5).map(publicMember),
    tasks: tasks.filter((t) => has(t.title + t.tag)).slice(0, 5).map((t) => ({ id: t.id, title: t.title, due: t.due })),
    docs: docs.filter((d) => has(d.title + d.body)).slice(0, 5).map((d) => ({ id: d.id, title: d.title })),
    events: events.filter((e) => has(e.title + e.place)).slice(0, 4).map((e) => ({ id: e.id, title: e.title, date: e.date, start: e.start })),
    base: base.filter((r) => has(r.title + r.tag)).slice(0, 4).map((r) => ({ id: r.id, title: r.title, status: r.status })),
    messages: messages.filter((m) => has(m.text)).slice(0, 5).map((m) => ({ id: m.id, channelId: m.channelId, userId: m.userId, text: m.text.slice(0, 80), channel: chName.get(m.channelId) || '' })),
    approvals: approvals.filter((a) => a.visible && has(a.mapped.title)).slice(0, 4).map((a) => ({ id: a.mapped.id, title: a.mapped.title, status: a.mapped.status })),
  });
}

async function ai(req: Request, user: DeptUser) {
  const body = await readBody(req);
  const q = str(body.q, 2000).trim();
  if (!q) return err('質問を入力してください');
  const markdown = await answerQuestion(user.id, q, body.channelId ? str(body.channelId, 80) : undefined);
  return json({ markdown });
}

async function reset(user: DeptUser) {
  if (user.role !== 'ceo') return err('データ初期化は社長のみ実行できます', 403);
  await seedDatabase({ reset: true });
  return json({ ok: true });
}

async function upload(req: Request, user: DeptUser) {
  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) return err('ファイルがありません');
  if (file.size > 8 * 1024 * 1024) return err('8MBまでのファイルを添付できます');
  const id = randomUUID();
  const root = uploadRoot();
  await mkdir(root, { recursive: true });
  const storage = path.join(root, id);
  await writeFile(storage, Buffer.from(await file.arrayBuffer()));
  const row = await db().attachment.create({
    data: { id, filename: file.name.slice(0, 180) || 'file', mime: file.type || 'application/octet-stream', size: file.size, path: storage, userId: user.id },
  });
  return json(mapAtt(row));
}

async function download(id: string, _user: DeptUser) {
  const att = await db().attachment.findUnique({ where: { id } });
  if (!att) return err('ファイルがありません', 404);
  const root = uploadRoot();
  const resolved = path.resolve(att.path);
  if (!resolved.startsWith(root + path.sep)) return err('forbidden', 403);
  const buf = await readFile(resolved).catch(() => null);
  if (!buf) return err('ファイルがありません', 404);
  const disp = att.mime.startsWith('image/') ? 'inline' : 'attachment';
  return new Response(buf, {
    headers: {
      'Content-Type': att.mime,
      'Content-Length': String(buf.length),
      'Content-Disposition': `${disp}; filename*=UTF-8''${encodeURIComponent(att.filename)}`,
      'Cache-Control': 'private, max-age=3600',
    },
  });
}

async function createAnnouncement(req: Request, user: DeptUser) {
  const body = await readBody(req);
  const title = str(body.title, 120).trim();
  if (!title) return err('タイトルを入力してください');
  const row = await db().announcement.create({
    data: { id: randomUUID(), title, body: str(body.body, 2000), authorId: user.id, date: todayYMD(), pin: false, tag: str(body.tag, 20) || '全社' },
  });
  return json(row);
}

async function listChannels(user: DeptUser) {
  const unread = await unreadMap(user.id);
  const rows = await db().channel.findMany({
    where: { members: { some: { userId: user.id } } },
    include: { members: true },
    orderBy: { sort: 'asc' },
  });
  return json(rows.map((c) => ({
    id: c.id,
    name: c.name,
    kind: c.kind,
    desc: c.desc,
    memberIds: c.members.map((m) => m.userId),
    peerId: c.kind === 'dm' ? c.members.find((m) => m.userId !== user.id)?.userId || null : null,
    unread: unread[c.id] || 0,
  })));
}

async function createChannel(req: Request, user: DeptUser) {
  const body = await readBody(req);
  if (body.kind === 'dm' || body.with) {
    const withId = str(body.with, 80);
    if (!withId || withId === user.id) return err('送信相手を選んでください');
    const other = await db().user.findUnique({ where: { id: withId } });
    if (!other) return err('メンバーが見つかりません', 404);
    const mine = await db().channel.findMany({ where: { kind: 'dm', members: { some: { userId: user.id } } }, include: { members: true } });
    const existing = mine.find((c) => c.members.some((m) => m.userId === withId));
    if (existing) return json({ id: existing.id });
    const sort = (await db().channel.aggregate({ _max: { sort: true } }))._max.sort || 0;
    const id = randomUUID();
    await db().channel.create({
      data: {
        id, name: `dm:${[user.id, withId].sort().join(':')}`, kind: 'dm', desc: '', sort: sort + 1,
        members: { create: [{ userId: user.id }, { userId: withId }] },
        reads: { create: [{ userId: user.id, lastReadAt: new Date() }, { userId: withId, lastReadAt: new Date(0) }] },
      },
    });
    return json({ id });
  }
  const name = str(body.name, 40).trim();
  if (!name) return err('チャンネル名を入力してください');
  const users = await db().user.findMany({ select: { id: true } });
  const sort = (await db().channel.aggregate({ _max: { sort: true } }))._max.sort || 0;
  const id = randomUUID();
  await db().channel.create({
    data: {
      id, name, kind: 'channel', desc: str(body.desc, 120), sort: sort + 1,
      members: { create: users.map((u) => ({ userId: u.id })) },
      reads: { create: users.map((u) => ({ userId: u.id, lastReadAt: u.id === user.id ? new Date() : new Date(0) })) },
    },
  });
  return json({ id });
}

async function listMessages(user: DeptUser, channelId: string, q: string) {
  const member = await db().channelMember.findUnique({ where: { channelId_userId: { channelId, userId: user.id } } });
  if (!member) return err('チャンネルがありません', 404);
  const rows = await db().message.findMany({ where: { channelId, parentId: null }, orderBy: { createdAt: 'asc' }, include: msgInclude });
  const query = q.trim();
  const filtered = query ? rows.filter((m) => m.text.includes(query)) : rows;
  return json(filtered.map(mapMessage));
}

async function postMessage(req: Request, user: DeptUser, channelId: string) {
  const member = await db().channelMember.findUnique({ where: { channelId_userId: { channelId, userId: user.id } } });
  if (!member) return err('チャンネルがありません', 404);
  const body = await readBody(req);
  const text = str(body.text, 4000).trim();
  const attachmentIds = Array.isArray(body.attachmentIds) ? body.attachmentIds.map((x) => str(x, 80)).filter(Boolean) : [];
  const parentId = body.parentId ? str(body.parentId, 80) : null;
  if (!text && !attachmentIds.length) return err('メッセージを入力してください');
  if (parentId) {
    const parent = await db().message.findUnique({ where: { id: parentId } });
    if (!parent || parent.channelId !== channelId || parent.parentId) return err('スレッドが見つかりません', 404);
  }
  const id = randomUUID();
  await db().message.create({ data: { id, channelId, userId: user.id, text, parentId, createdAt: new Date() } });
  if (attachmentIds.length) await linkAttachments(attachmentIds, user.id, { messageId: id });
  await markRead(channelId, user.id);
  const full = await db().message.findUnique({ where: { id }, include: msgInclude });
  await afterMessage(channelId, user, text);
  return json(mapMessage(full!));
}

async function toggleReaction(req: Request, user: DeptUser, messageId: string) {
  const body = await readBody(req);
  const emoji = str(body.emoji, 8);
  if (!emoji) return err('絵文字がありません');
  const message = await db().message.findUnique({ where: { id: messageId } });
  if (!message) return err('メッセージがありません', 404);
  const member = await db().channelMember.findUnique({ where: { channelId_userId: { channelId: message.channelId, userId: user.id } } });
  if (!member) return err('チャンネルがありません', 404);
  const key = { messageId, userId: user.id, emoji };
  const existing = await db().reaction.findUnique({ where: { messageId_userId_emoji: key } });
  if (existing) await db().reaction.delete({ where: { messageId_userId_emoji: key } });
  else await db().reaction.create({ data: key });
  publish({ type: 'message', channelId: message.channelId });
  return json({ ok: true });
}

async function saveEvent(req: Request, user: DeptUser, id: string | null) {
  const body = await readBody(req);
  const title = str(body.title, 120).trim() || '（無題）';
  const date = str(body.date, 10) || todayYMD();
  const start = str(body.start, 5) || '10:00';
  const end = str(body.end, 5) || '11:00';
  const attendees = Array.isArray(body.attendees) ? [...new Set(body.attendees.map((x) => str(x, 80)).filter(Boolean))] : [user.id];
  const known = await db().user.findMany({ where: { id: { in: attendees } }, select: { id: true } });
  if (known.length !== attendees.length) return err('参加者を確認してください');
  const data = { title, date, start, end, color: str(body.color, 20) || '#6a6fc4', place: str(body.place, 80), desc: str(body.desc, 1000) };
  const eventId = id || randomUUID();
  if (!id) await db().calendarEvent.create({ data: { id: eventId, ...data, createdById: user.id } });
  else await db().calendarEvent.update({ where: { id: eventId }, data });
  await db().eventAttendee.deleteMany({ where: { eventId } });
  if (attendees.length) await db().eventAttendee.createMany({ data: attendees.map((userId) => ({ eventId, userId })) });
  const row = await db().calendarEvent.findUnique({ where: { id: eventId }, include: { attendees: true } });
  return json(mapEvent(row!));
}

async function saveTask(req: Request, user: DeptUser, id: string | null) {
  const body = await readBody(req);
  const assigneeId = str(body.assigneeId, 80) || user.id;
  if (!(await db().user.findUnique({ where: { id: assigneeId } }))) return err('担当者が見つかりません');
  const status = ['todo', 'doing', 'review', 'done'].includes(str(body.status)) ? str(body.status) : 'todo';
  const priority = ['高', '中', '低'].includes(str(body.priority)) ? str(body.priority) : '中';
  const data = {
    title: str(body.title, 160).trim() || '（無題）',
    status, assigneeId, priority,
    start: str(body.start, 10) || todayYMD(),
    due: str(body.due, 10) || todayYMD(),
    tag: str(body.tag, 20) || '社内',
  };
  let taskId = id;
  let prevAssignee: string | null = null;
  if (!id) {
    const sort = (await db().task.aggregate({ _max: { sort: true } }))._max.sort ?? 0;
    taskId = randomUUID();
    await db().task.create({ data: { id: taskId, ...data, creatorId: user.id, sort: sort + 1 } });
  } else {
    const prev = await db().task.findUnique({ where: { id } });
    if (!prev) return err('タスクがありません', 404);
    prevAssignee = prev.assigneeId;
    const patch: Record<string, unknown> = {};
    for (const k of ['title', 'status', 'assigneeId', 'priority', 'start', 'due', 'tag'] as const) {
      if (k in body) patch[k] = data[k];
    }
    if (Object.keys(patch).length) await db().task.update({ where: { id }, data: patch });
  }
  if (Array.isArray(body.subtasks)) {
    await db().subtask.deleteMany({ where: { taskId: taskId! } });
    const subs = body.subtasks
      .map((s) => (typeof s === 'object' && s ? s as { title?: string; done?: boolean } : null))
      .filter((s): s is { title?: string; done?: boolean } => !!s && !!str(s.title, 120).trim());
    if (subs.length) {
      await db().subtask.createMany({
        data: subs.map((s, i) => ({ taskId: taskId!, title: str(s.title, 120).trim(), done: !!s.done, sort: i })),
      });
    }
  }
  if (assigneeId !== user.id && assigneeId !== prevAssignee) {
    await notify(assigneeId, { icon: 'task', text: `${user.name}さんがタスク「${data.title}」を割り当てました`, go: 'tasks' });
  }
  publish({ type: 'task' });
  const row = await db().task.findUnique({ where: { id: taskId! }, include: { subtasks: true } });
  return json(mapTask(row!));
}

async function saveDoc(req: Request, user: DeptUser, id: string | null) {
  const body = await readBody(req);
  if (!id) {
    const folders = await db().folder.findMany({ orderBy: { sort: 'asc' } });
    const folderId = str(body.folderId, 80) || folders[0]?.id;
    if (!folderId) return err('フォルダがありません');
    const row = await db().doc.create({
      data: { id: randomUUID(), folderId, title: str(body.title, 160).trim() || '無題のドキュメント', body: str(body.body, 20000) || '# 無題のドキュメント\n\nここに内容を書いてください。', updatedBy: user.id, updatedOn: todayYMD() },
    });
    return json(row);
  }
  const prev = await db().doc.findUnique({ where: { id } });
  if (!prev) return err('ドキュメントがありません', 404);
  const data: { title?: string; body?: string; folderId?: string; updatedBy: string; updatedOn: string } = { updatedBy: user.id, updatedOn: todayYMD() };
  if ('title' in body) data.title = str(body.title, 160).trim() || '無題のドキュメント';
  if ('body' in body) data.body = str(body.body, 50000);
  if ('folderId' in body) data.folderId = str(body.folderId, 80);
  const row = await db().doc.update({ where: { id }, data });
  return json(row);
}

async function saveBase(req: Request, user: DeptUser, id: string | null) {
  const body = await readBody(req);
  const stages = ['企画', '撮影', '編集', '確認', '公開'];
  const platforms = ['YouTube', 'TikTok', 'Shorts', 'Instagram'];
  if (!id) {
    const sort = (await db().baseRow.aggregate({ _max: { sort: true } }))._max.sort ?? 0;
    const row = await db().baseRow.create({
      data: { id: randomUUID(), title: '新しい動画企画', platform: 'YouTube', status: '企画', ownerId: user.id, publish: todayYMD(), tag: '', views: 0, sort: sort + 1 },
    });
    return json(row);
  }
  const prev = await db().baseRow.findUnique({ where: { id } });
  if (!prev) return err('行がありません', 404);
  const data: Record<string, unknown> = {};
  if ('title' in body) data.title = str(body.title, 160) || '（無題）';
  if ('platform' in body && platforms.includes(str(body.platform))) data.platform = str(body.platform);
  if ('status' in body && stages.includes(str(body.status))) data.status = str(body.status);
  if ('ownerId' in body) {
    const owner = await db().user.findUnique({ where: { id: str(body.ownerId, 80) } });
    if (!owner) return err('担当者が見つかりません');
    data.ownerId = owner.id;
  }
  if ('publish' in body) data.publish = str(body.publish, 10);
  if ('tag' in body) data.tag = str(body.tag, 40);
  if ('views' in body) data.views = Math.max(0, Math.round(Number(body.views) || 0));
  const row = await db().baseRow.update({ where: { id }, data });
  return json(row);
}

async function createApproval(req: Request, user: DeptUser) {
  const body = await readBody(req);
  const type = ['経費', '稟議', '休暇'].includes(str(body.type)) ? str(body.type) : '経費';
  const title = str(body.title, 160).trim();
  if (!title) return err('件名を入力してください');
  let approvers = Array.isArray(body.approverIds) ? body.approverIds.map((x) => str(x, 80)) : [];
  approvers = [...new Set(approvers)].filter((id) => id && id !== user.id);
  if (!approvers.length) return err('承認者を1人以上選んでください');
  const known = await db().user.findMany({ where: { id: { in: approvers } }, select: { id: true } });
  if (known.length !== approvers.length) return err('承認者を確認してください');
  const id = randomUUID();
  const row = await db().approval.create({
    data: {
      id, type, title, amount: Math.max(0, Math.round(Number(body.amount) || 0)), requesterId: user.id,
      date: todayYMD(), status: 'pending', note: str(body.note, 1000),
      steps: { create: approvers.map((approverId, i) => ({ approverId, position: i, status: i === 0 ? 'pending' : 'waiting' })) },
    },
    include: { steps: true, requester: true },
  });
  await notify(approvers[0], { icon: 'flow', text: `${user.name}さんが${type}「${title}」を申請しました`, go: 'approvals' });
  publish({ type: 'approval' });
  return json(mapApproval(row));
}

async function decideApproval(req: Request, user: DeptUser, id: string) {
  const body = await readBody(req);
  const decision = body.decision === 'rejected' ? 'rejected' : body.decision === 'approved' ? 'approved' : '';
  if (!decision) return err('承認または却下を指定してください');
  const approval = await db().approval.findUnique({ where: { id }, include: { steps: true, requester: true } });
  if (!approval) return err('申請がありません', 404);
  const result = applyDecision(approval.steps.map((s) => ({ approverId: s.approverId, position: s.position, status: s.status })), user.id, decision);
  if (result.error) return err(result.error, 403);
  for (const step of result.steps) {
    const prev = approval.steps.find((s) => s.position === step.position);
    if (prev && prev.status !== step.status) {
      await db().approvalStep.updateMany({ where: { approvalId: id, position: step.position }, data: { status: step.status, decidedAt: new Date() } });
    }
  }
  await db().approval.update({ where: { id }, data: { status: result.approvalStatus } });
  if (result.approvalStatus === 'pending' && result.nextApproverId) {
    await notify(result.nextApproverId, { icon: 'flow', text: `${user.name}さんが「${approval.title}」を承認しました。あなたの確認待ちです`, go: 'approvals' });
  } else {
    await notify(approval.requesterId, { icon: 'flow', text: `「${approval.title}」が${result.approvalStatus === 'approved' ? '承認' : '却下'}されました`, go: 'approvals' });
  }
  publish({ type: 'approval' });
  const fresh = await db().approval.findUnique({ where: { id }, include: { steps: true } });
  return json(mapApproval(fresh!));
}

async function saveMeeting(req: Request, user: DeptUser, id: string | null) {
  const body = await readBody(req);
  if (!id) {
    const title = str(body.title, 120).trim();
    if (!title) return err('会議名を入力してください');
    const attendees = Array.isArray(body.attendees) ? [...new Set(body.attendees.map((x) => str(x, 80)))] : [user.id];
    const rowId = randomUUID();
    await db().meeting.create({
      data: { id: rowId, title, date: str(body.date, 10) || todayYMD(), time: str(body.time, 5) || '10:00', status: 'upcoming', minutes: '', attendees: { create: attendees.filter(Boolean).map((userId) => ({ userId })) } },
    });
    if (body.calendar) {
      const time = str(body.time, 5) || '10:00';
      const h = Math.min(23, Number(time.slice(0, 2)) + 1);
      const end = `${String(h).padStart(2, '0')}${time.slice(2)}`;
      const eventId = randomUUID();
      await db().calendarEvent.create({
        data: { id: eventId, title, date: str(body.date, 10) || todayYMD(), start: time, end, color: '#6a6fc4', place: 'オンライン', desc: '', createdById: user.id, attendees: { create: attendees.filter(Boolean).map((userId) => ({ userId })) } },
      });
    }
    const row = await db().meeting.findUnique({ where: { id: rowId }, include: { attendees: true } });
    return json({ id: row!.id, title: row!.title, date: row!.date, time: row!.time, status: row!.status, minutes: row!.minutes, attendees: row!.attendees.map((a) => a.userId) });
  }
  const prev = await db().meeting.findUnique({ where: { id } });
  if (!prev) return err('会議がありません', 404);
  const data: Record<string, unknown> = {};
  if ('minutes' in body) data.minutes = str(body.minutes, 20000);
  if ('status' in body && (body.status === 'done' || body.status === 'upcoming')) data.status = body.status;
  if ('title' in body) data.title = str(body.title, 120);
  await db().meeting.update({ where: { id }, data });
  const row = await db().meeting.findUnique({ where: { id }, include: { attendees: true } });
  return json({ id: row!.id, title: row!.title, date: row!.date, time: row!.time, status: row!.status, minutes: row!.minutes, attendees: row!.attendees.map((a) => a.userId) });
}

async function getAttendance(user: DeptUser, userId: string | null) {
  const target = userId || user.id;
  const privileged = user.role === 'ceo' || user.role === 'vp' || (user.role === 'manager' && user.deptId === 'admin');
  if (target !== user.id && !privileged) return err('他のメンバーの勤怠は閲覧できません', 403);
  const rows = await db().attendance.findMany({ where: { userId: target }, orderBy: { date: 'asc' } });
  return json(rows.map((r) => ({ date: r.date, inTime: r.inTime, outTime: r.outTime, breakMin: r.breakMin })));
}

async function clock(req: Request, user: DeptUser) {
  const body = await readBody(req);
  const today = todayYMD();
  const now = hmNow();
  if (body.action === 'in') {
    await db().attendance.upsert({
      where: { userId_date: { userId: user.id, date: today } },
      create: { userId: user.id, date: today, inTime: now, outTime: null, breakMin: 60 },
      update: { inTime: now, outTime: null, breakMin: 60 },
    });
    publish({ type: 'attendance', userId: user.id });
    return json({ clockedIn: { inTime: now } });
  }
  if (body.action === 'out') {
    const row = await db().attendance.findUnique({ where: { userId_date: { userId: user.id, date: today } } });
    if (!row || row.outTime) return err('出勤していません');
    const worked = hmToMinutes(now) - hmToMinutes(row.inTime);
    const breakMin = worked > 360 ? 60 : 0;
    await db().attendance.update({ where: { userId_date: { userId: user.id, date: today } }, data: { outTime: now, breakMin } });
    publish({ type: 'attendance', userId: user.id });
    return json({ clockedIn: null, outTime: now });
  }
  return err('action が不正です');
}

async function createOkr(req: Request, user: DeptUser) {
  const body = await readBody(req);
  const objective = str(body.objective, 200).trim();
  if (!objective) return err('Objectiveを入力してください');
  const ownerId = str(body.ownerId, 80) || user.id;
  if (!(await db().user.findUnique({ where: { id: ownerId } }))) return err('オーナーが見つかりません');
  const krs = Array.isArray(body.krs) ? body.krs : [];
  const id = randomUUID();
  await db().okr.create({
    data: {
      id, ownerId, objective,
      krs: {
        create: (krs.length ? krs : [{ title: '達成度', target: 100 }]).map((k, i) => {
          const row = k as { title?: string; target?: number; current?: number; inverse?: boolean };
          return { title: str(row.title, 120) || '達成度', current: Number(row.current) || 0, target: Number(row.target) || 100, inverse: !!row.inverse, sort: i };
        }),
      },
    },
  });
  const row = await db().okr.findUnique({ where: { id }, include: { krs: true } });
  return json(row);
}

async function patchOkr(req: Request, user: DeptUser, id: string) {
  const okr = await db().okr.findUnique({ where: { id }, include: { krs: true } });
  if (!okr) return err('目標がありません', 404);
  if (user.id !== okr.ownerId && user.role !== 'ceo' && user.role !== 'vp') return err('この目標は更新できません', 403);
  const body = await readBody(req);
  if (Array.isArray(body.krs)) {
    for (const k of body.krs as { id?: string; current?: number }[]) {
      if (!k.id) continue;
      await db().keyResult.updateMany({ where: { id: str(k.id, 80), okrId: id }, data: { current: Number(k.current) || 0 } });
    }
  }
  const row = await db().okr.findUnique({ where: { id }, include: { krs: true } });
  return json({
    id: row!.id, ownerId: row!.ownerId, objective: row!.objective,
    krs: row!.krs.sort((a, b) => a.sort - b.sort).map((k) => ({ id: k.id, title: k.title, current: k.current, target: k.target, inverse: k.inverse })),
  });
}

async function readNotes(req: Request, user: DeptUser) {
  const body = await readBody(req);
  if (body.all) await db().notification.updateMany({ where: { userId: user.id, read: false }, data: { read: true } });
  else if (body.id) await db().notification.updateMany({ where: { id: str(body.id, 80), userId: user.id }, data: { read: true } });
  const rows = await db().notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 40 });
  return json(rows.map(mapNote));
}
