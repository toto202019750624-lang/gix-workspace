import { randomUUID, timingSafeEqual } from 'node:crypto';
import { db } from '../lib/prisma';
import { hmNow, todayYMD } from '../lib/dates';
import { applyDecision } from '../lib/approvals';
import { publish } from './bus';
import {
  deptChannel,
  managerFor,
  planTemplate,
  rotateEmployees,
  sanitizeAction,
  shouldAutoTick,
  workPhase,
  type Action,
  type EmpRef,
  type InboxItem,
} from '../lib/ai-rhythm';

const OWNER_ID = 'chima';
const MAX_ACTIONS = 40;

export function bearerMatches(header: string | null, expected: string) {
  if (!expected) return false;
  const got = (header || '').replace(/^Bearer\s+/i, '').trim();
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  if (a.length === 0 || a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function agentAuthorized(req: Request) {
  return bearerMatches(req.headers.get('authorization'), process.env.AGENT_API_TOKEN || '');
}

export function cronAuthorized(req: Request) {
  const header = req.headers.get('authorization');
  const alt = req.headers.get('x-cron-secret');
  return bearerMatches(header, process.env.CRON_SECRET || '') || bearerMatches(alt ? `Bearer ${alt}` : null, process.env.CRON_SECRET || '');
}

function clip(text: string, max = 500) {
  const clean = text.replace(/\u0000/g, '').trim();
  return clean.length > max ? clean.slice(0, max - 1) + '…' : clean;
}

async function logActivity(userId: string, kind: string, summary: string, viaLlm = false) {
  await db().aiActivity.create({
    data: { id: randomUUID(), userId, kind, summary: clip(summary, 240), viaLlm, createdAt: new Date() },
  });
}

async function setting() {
  return db().appSetting.upsert({
    where: { id: 'app' },
    create: { id: 'app', aiEmployeesEnabled: true },
    update: {},
  });
}

export async function employees() {
  return db().user.findMany({
    where: { id: { not: OWNER_ID } },
    include: { dept: true },
    orderBy: { ext: 'asc' },
  });
}

export async function agentContext() {
  const now = new Date();
  const today = todayYMD(now);
  const phase = workPhase(now);
  const staff = await employees();
  const ids = staff.map((u) => u.id);
  const since = new Date(now.getTime() - 36 * 60 * 60 * 1000);
  const [messages, tasks, steps, events, channels, attendance, company] = await Promise.all([
    db().message.findMany({
      where: { createdAt: { gte: since }, parentId: null },
      orderBy: { createdAt: 'desc' },
      take: 180,
      include: { user: true, replies: { include: { user: true }, orderBy: { createdAt: 'asc' } }, channel: { include: { members: true } }, reactions: true },
    }),
    db().task.findMany({ where: { assigneeId: { in: ids }, status: { not: 'done' } }, include: { subtasks: true }, orderBy: { due: 'asc' } }),
    db().approvalStep.findMany({
      where: { approverId: { in: ids }, status: 'pending' },
      include: { approval: { include: { requester: true } } },
    }),
    db().calendarEvent.findMany({ where: { date: today }, include: { attendees: true }, orderBy: { start: 'asc' } }),
    db().channel.findMany({ where: { kind: 'channel' }, orderBy: { sort: 'asc' } }),
    db().attendance.findMany({ where: { userId: { in: ids }, date: today } }),
    db().company.findUnique({ where: { id: 'gix' } }),
  ]);
  const clocked = new Set(attendance.filter((row) => row.inTime && !row.outTime).map((row) => row.userId));
  const nameOf = new Map(staff.map((u) => [u.id, u.name]));
  nameOf.set(OWNER_ID, 'ちま');

  const recentChannels = channels.map((channel) => ({
    id: channel.id,
    name: channel.name,
    messages: messages
      .filter((m) => m.channelId === channel.id)
      .slice(0, 6)
      .reverse()
      .map((m) => ({
        id: m.id,
        userId: m.userId,
        name: m.user.name,
        text: m.text.slice(0, 180),
        viaAi: m.viaAi,
        ts: m.createdAt.toISOString(),
      })),
  }));

  return {
    now: now.toISOString(),
    phase,
    timezone: 'Asia/Tokyo',
    company: company ? { name: company.name, hq: company.hq, founded: company.founded, capitalYen: company.capitalYen } : null,
    ownerId: OWNER_ID,
    eventsToday: events.map((e) => ({ id: e.id, title: e.title, start: e.start, end: e.end, place: e.place, attendees: e.attendees.map((a) => a.userId) })),
    recentChannels,
    employees: staff.map((emp) => {
      const unread = messages.flatMap((m) => {
        const hits: InboxItem[] = [];
        const addressed = (text: string) => text.includes(`@${emp.name}`) || text.includes(`@${emp.name.replace(/\s/g, '')}`) || text.includes('@全員');
        const replied = m.replies.some((r) => r.userId === emp.id) || m.userId === emp.id;
        const dmToEmp = m.channel.kind === 'dm' && m.channel.members.some((member) => member.userId === emp.id) && m.userId !== emp.id;
        if (!replied && (addressed(m.text) || dmToEmp)) {
          hits.push({
            channelId: m.channelId,
            messageId: m.id,
            fromId: m.userId,
            fromName: m.user.name,
            text: m.text.slice(0, 180),
            owner: m.userId === OWNER_ID,
          });
        }
        for (const reply of m.replies) {
          if (reply.userId === emp.id) continue;
          if (!addressed(reply.text) && reply.userId !== OWNER_ID) continue;
          const later = m.replies.some((r) => r.userId === emp.id && r.createdAt > reply.createdAt);
          if (later) continue;
          hits.push({
            channelId: m.channelId,
            messageId: reply.id,
            parentId: m.id,
            fromId: reply.userId,
            fromName: reply.user.name,
            text: reply.text.slice(0, 180),
            owner: reply.userId === OWNER_ID,
          });
        }
        return hits;
      }).slice(0, 8);
      return {
        id: emp.id,
        name: emp.name,
        deptId: emp.deptId,
        dept: emp.dept?.name || '',
        role: emp.role,
        title: emp.title,
        skills: safeSkills(emp.skills),
        bio: emp.bio,
        clockedIn: clocked.has(emp.id),
        channelId: deptChannel(emp.deptId),
        managerId: managerFor(emp),
        needsReply: unread,
        tasks: tasks.filter((t) => t.assigneeId === emp.id).slice(0, 6).map((t) => ({
          id: t.id, title: t.title, status: t.status, due: t.due, priority: t.priority,
          subtasks: t.subtasks.map((s) => ({ id: s.id, title: s.title, done: s.done })),
        })),
        pendingApprovals: steps.filter((s) => s.approverId === emp.id).map((s) => ({
          id: s.approval.id,
          title: s.approval.title,
          type: s.approval.type,
          amount: s.approval.amount,
          note: s.approval.note,
          requesterId: s.approval.requesterId,
          requesterName: s.approval.requester.name,
        })),
      };
    }),
    hint: '社員になりきって、needsReply（特に owner: true）を優先し、部署チャンネルへ進捗を書き、タスクと承認を進めてください。文章はあなたが書いて actions に載せてください。',
  };
}

function safeSkills(raw: string) {
  try { return JSON.parse(raw) as string[]; } catch { return []; }
}

type ActionResult = { employeeId: string; ok: boolean; summary?: string; error?: string };

export async function applyAgentActions(actions: unknown[]) {
  if (!Array.isArray(actions)) throw new Error('actions 配列が必要です');
  if (actions.length > MAX_ACTIONS) throw new Error(`1回のアクションは${MAX_ACTIONS}件までです`);
  const staff = await employees();
  const byId = new Map(staff.map((u) => [u.id, u]));
  const results: ActionResult[] = [];
  for (const raw of actions) {
    const row = raw as { employeeId?: string };
    const emp = row?.employeeId ? byId.get(String(row.employeeId)) : undefined;
    if (!emp) {
      results.push({ employeeId: String(row?.employeeId || ''), ok: false, error: '社員が見つかりません' });
      continue;
    }
    const empRef: EmpRef = { id: emp.id, name: emp.name, role: emp.role, title: emp.title, deptId: emp.deptId, skills: safeSkills(emp.skills) };
    const action = sanitizeAction(raw, empRef);
    if (!action) {
      results.push({ employeeId: emp.id, ok: false, error: 'アクションの形式が不正です' });
      continue;
    }
    try {
      const summary = await executeAction(emp.id, emp.name, action);
      results.push({ employeeId: emp.id, ok: true, summary });
    } catch (error) {
      results.push({ employeeId: emp.id, ok: false, error: error instanceof Error ? error.message : '失敗しました' });
    }
  }
  return { results, ok: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length };
}

async function clock(employeeId: string, action: 'in' | 'out') {
  const today = todayYMD();
  const now = hmNow();
  if (action === 'in') {
    await db().attendance.upsert({
      where: { userId_date: { userId: employeeId, date: today } },
      create: { userId: employeeId, date: today, inTime: now, outTime: null, breakMin: 60 },
      update: { inTime: now, outTime: null, breakMin: 60 },
    });
    return;
  }
  const row = await db().attendance.findUnique({ where: { userId_date: { userId: employeeId, date: today } } });
  if (!row || row.outTime) throw new Error('出勤していません');
  await db().attendance.update({ where: { userId_date: { userId: employeeId, date: today } }, data: { outTime: now } });
}

async function executeAction(employeeId: string, name: string, action: Action) {
  if (action.type === 'clock') {
    await clock(employeeId, action.action);
    const summary = action.action === 'in' ? `${name}が出勤しました` : `${name}が退勤しました`;
    await logActivity(employeeId, 'clock', summary);
    publish({ type: 'attendance', userId: employeeId });
    return summary;
  }
  if (action.type === 'post') {
    const member = await db().channelMember.findUnique({ where: { channelId_userId: { channelId: action.channelId, userId: employeeId } } });
    if (!member) throw new Error('そのチャンネルには投稿できません');
    if (action.parentId) {
      const parent = await db().message.findUnique({ where: { id: action.parentId } });
      if (!parent || parent.channelId !== action.channelId) throw new Error('スレッドが見つかりません');
    }
    const id = randomUUID();
    await db().message.create({
      data: { id, channelId: action.channelId, userId: employeeId, text: action.text, parentId: action.parentId || null, viaAi: true, createdAt: new Date() },
    });
    publish({ type: 'message', channelId: action.channelId, userId: employeeId });
    const summary = `${name}がメッセージを投稿しました`;
    await logActivity(employeeId, 'message', `${summary}: ${action.text.slice(0, 80)}`);
    return summary;
  }
  if (action.type === 'react') {
    const message = await db().message.findUnique({ where: { id: action.messageId } });
    if (!message) throw new Error('メッセージがありません');
    const member = await db().channelMember.findUnique({ where: { channelId_userId: { channelId: message.channelId, userId: employeeId } } });
    if (!member) throw new Error('リアクションできません');
    await db().reaction.upsert({
      where: { messageId_userId_emoji: { messageId: message.id, userId: employeeId, emoji: action.emoji } },
      create: { messageId: message.id, userId: employeeId, emoji: action.emoji },
      update: {},
    });
    publish({ type: 'message', channelId: message.channelId });
    const summary = `${name}が ${action.emoji} しました`;
    await logActivity(employeeId, 'reaction', summary);
    return summary;
  }
  if (action.type === 'task') {
    const task = await db().task.findUnique({ where: { id: action.taskId }, include: { subtasks: true } });
    if (!task || task.assigneeId !== employeeId) throw new Error('自分のタスクだけ更新できます');
    if (action.status) await db().task.update({ where: { id: task.id }, data: { status: action.status } });
    if (action.subtaskId) {
      const sub = task.subtasks.find((s) => s.id === action.subtaskId);
      if (!sub) throw new Error('サブタスクがありません');
      await db().subtask.update({ where: { id: sub.id }, data: { done: action.done !== false } });
    }
    if (action.comment) {
      await db().taskComment.create({ data: { id: randomUUID(), taskId: task.id, userId: employeeId, text: action.comment, viaAi: true } });
    }
    publish({ type: 'task' });
    const summary = `${name}がタスク「${task.title}」を更新しました`;
    await logActivity(employeeId, 'task', summary);
    return summary;
  }
  if (action.type === 'approval') {
    const id = randomUUID();
    await db().approval.create({
      data: {
        id,
        type: action.approvalType,
        title: action.title,
        amount: action.amount,
        requesterId: employeeId,
        date: todayYMD(),
        status: 'pending',
        note: action.note,
        viaAi: true,
        steps: { create: [{ approverId: action.approverId, position: 0, status: 'pending' }] },
      },
    });
    publish({ type: 'approval' });
    const summary = `${name}が${action.approvalType}「${action.title}」を申請しました`;
    await logActivity(employeeId, 'approval', summary);
    return summary;
  }
  if (action.type === 'decide') {
    const approval = await db().approval.findUnique({ where: { id: action.approvalId }, include: { steps: true } });
    if (!approval) throw new Error('申請がありません');
    const result = applyDecision(approval.steps.map((s) => ({ approverId: s.approverId, position: s.position, status: s.status })), employeeId, action.decision);
    if (result.error) throw new Error(result.error);
    for (const step of result.steps) {
      const prev = approval.steps.find((s) => s.position === step.position);
      if (prev && prev.status !== step.status) {
        await db().approvalStep.updateMany({
          where: { approvalId: approval.id, position: step.position },
          data: { status: step.status, decidedAt: new Date(), comment: step.approverId === employeeId ? action.reason : prev.comment },
        });
      }
    }
    await db().approval.update({ where: { id: approval.id }, data: { status: result.approvalStatus, viaAi: true } });
    publish({ type: 'approval' });
    const summary = `${name}が「${approval.title}」を${action.decision === 'approved' ? '承認' : '却下'}しました（${action.reason}）`;
    await logActivity(employeeId, 'approval', summary);
    return summary;
  }
  if (action.type === 'minutes') {
    const meeting = await db().meeting.findUnique({ where: { id: action.meetingId }, include: { attendees: true } });
    if (!meeting || !meeting.attendees.some((a) => a.userId === employeeId)) throw new Error('参加している会議だけ記録できます');
    const next = meeting.minutes ? `${meeting.minutes.trim()}\n\n${action.text}` : action.text;
    await db().meeting.update({ where: { id: meeting.id }, data: { minutes: next, minutesViaAi: true } });
    const summary = `${name}が「${meeting.title}」の議事メモを書きました`;
    await logActivity(employeeId, 'meeting', summary);
    return summary;
  }
  const folder = await db().folder.findUnique({ where: { id: action.folderId } });
  const folderId = folder?.id || (await db().folder.findFirst({ orderBy: { sort: 'asc' } }))?.id;
  if (!folderId) throw new Error('フォルダがありません');
  const id = randomUUID();
  await db().doc.create({
    data: { id, folderId, title: action.title, body: action.body, updatedBy: employeeId, updatedOn: todayYMD(), viaAi: true },
  });
  const summary = `${name}がドキュメント「${action.title}」を書きました`;
  await logActivity(employeeId, 'doc', summary);
  return summary;
}

/** Built-in tick. Without an LLM key this only clocks people in or out. */
export async function runLightweightTick(trigger: 'cron' | 'visit' | 'manual') {
  const now = new Date();
  const phase = workPhase(now);
  const row = await setting();
  const minMinutes = Math.max(5, Number(process.env.AI_TICK_MINUTES) || 20);
  if (trigger !== 'manual') {
    if (!shouldAutoTick({ enabled: row.aiEmployeesEnabled, lastTickAt: row.lastTickAt, now, minMinutes, phase })) {
      return { skipped: true, reason: !row.aiEmployeesEnabled ? 'disabled' : phase === 'off' ? 'off-hours' : 'throttled', phase };
    }
  } else if (phase === 'off') {
    return { skipped: true, reason: 'off-hours', phase };
  }
  if (phase !== 'morning' && phase !== 'evening') {
    await db().appSetting.update({ where: { id: 'app' }, data: { lastTickAt: now } });
    return { skipped: true, reason: 'daytime-left-to-agent', phase, acted: [] as string[] };
  }
  const staff = await employees();
  const today = todayYMD(now);
  const attendance = await db().attendance.findMany({ where: { date: today, userId: { in: staff.map((s) => s.id) } } });
  const clocked = new Set(attendance.filter((a) => a.inTime && !a.outTime).map((a) => a.userId));
  const pool = phase === 'morning' ? staff.filter((s) => !clocked.has(s.id)) : staff.filter((s) => clocked.has(s.id));
  const seed = Number(today.replace(/-/g, '')) + Number(tokyoHour(now));
  const batch = rotateEmployees(pool, seed, Math.max(1, Number(process.env.AI_TICK_EMPLOYEES) || 8));
  const acted: string[] = [];
  for (const emp of batch) {
    const skills = safeSkills(emp.skills);
    const planned = planTemplate({
      emp: { id: emp.id, name: emp.name, role: emp.role, title: emp.title, deptId: emp.deptId, skills },
      phase,
      clockedIn: clocked.has(emp.id),
      inboxOwner: null,
      inboxOther: null,
      colleague: null,
      task: null,
      pending: null,
      meeting: null,
    }).filter((action) => action.type === 'clock');
    for (const action of planned) {
      await executeAction(emp.id, emp.name, action);
      acted.push(`${emp.name}:${action.type}`);
    }
  }
  await db().appSetting.update({ where: { id: 'app' }, data: { lastTickAt: now } });
  return { skipped: false, phase, trigger, acted };
}

function tokyoHour(date: Date) {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Tokyo', hour: '2-digit', hourCycle: 'h23' }).format(date).replace('24', '00'));
}

export async function todayActivity() {
  const start = new Date(`${todayYMD()}T00:00:00+09:00`);
  const [row, activities] = await Promise.all([
    setting(),
    db().aiActivity.findMany({ where: { createdAt: { gte: start } }, orderBy: { createdAt: 'desc' }, take: 40 }),
  ]);
  return {
    enabled: row.aiEmployeesEnabled,
    lastTickAt: row.lastTickAt?.toISOString() || null,
    activities: activities.map((a) => ({ id: a.id, userId: a.userId, kind: a.kind, summary: a.summary, viaLlm: a.viaLlm, ts: a.createdAt.toISOString() })),
  };
}

export async function setAiEnabled(enabled: boolean) {
  const row = await db().appSetting.upsert({
    where: { id: 'app' },
    create: { id: 'app', aiEmployeesEnabled: enabled },
    update: { aiEmployeesEnabled: enabled },
  });
  return { enabled: row.aiEmployeesEnabled };
}
