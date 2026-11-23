import { todayYMD, tokyoParts, utcDow } from './dates';

export type WorkPhase = 'off' | 'morning' | 'day' | 'evening';

export type EmpRef = {
  id: string;
  name: string;
  role: string;
  title: string;
  deptId: string;
  skills: string[];
};

export type InboxItem = {
  channelId: string;
  messageId: string;
  parentId?: string;
  fromId: string;
  fromName: string;
  text: string;
  owner: boolean;
};

export type TaskRef = {
  id: string;
  title: string;
  status: string;
  subtasks: { id: string; title: string; done: boolean }[];
};

export type PendingRef = { id: string; title: string; type: string; amount: number; requesterName: string };

export type Action =
  | { type: 'clock'; action: 'in' | 'out' }
  | { type: 'post'; channelId: string; text: string; parentId?: string }
  | { type: 'react'; messageId: string; emoji: string }
  | { type: 'task'; taskId: string; status?: string; subtaskId?: string; done?: boolean; comment?: string }
  | { type: 'approval'; title: string; approvalType: string; amount: number; note: string; approverId: string }
  | { type: 'decide'; approvalId: string; decision: 'approved' | 'rejected'; reason: string }
  | { type: 'minutes'; meetingId: string; text: string }
  | { type: 'doc'; title: string; body: string; folderId: string };

const MANAGERS: Record<string, string> = {
  plan: 'sato',
  prod: 'tanaka',
  codex: 'tanaka',
  sns: 'matsumoto',
  ai: 'hayashi',
  admin: 'saito',
  exec: 'chima',
};

export function deptChannel(deptId: string) {
  if (deptId === 'plan') return 'plan';
  if (deptId === 'prod' || deptId === 'codex') return 'prod';
  if (deptId === 'sns') return 'sns';
  if (deptId === 'ai') return 'ai';
  if (deptId === 'admin') return 'admin';
  return 'general';
}

export function managerFor(emp: { id: string; deptId: string }) {
  const manager = MANAGERS[emp.deptId] || 'chima';
  return manager === emp.id ? 'chima' : manager;
}

/** JST weekday hours. Morning plan, daytime work, evening report. */
export function workPhase(date = new Date()): WorkPhase {
  const ymd = todayYMD(date);
  const dow = utcDow(ymd);
  if (dow === 0 || dow === 6) return 'off';
  const hour = Number(tokyoParts(date).hour);
  if (hour < 9 || hour >= 19) return 'off';
  if (hour < 11) return 'morning';
  if (hour < 17) return 'day';
  return 'evening';
}

export function shouldAutoTick(opts: { enabled: boolean; lastTickAt: Date | null; now: Date; minMinutes: number; phase: WorkPhase }) {
  if (!opts.enabled || opts.phase === 'off') return false;
  if (!opts.lastTickAt) return true;
  return opts.now.getTime() - opts.lastTickAt.getTime() >= opts.minMinutes * 60_000;
}

export function rotateEmployees<T>(items: T[], seed: number, count: number): T[] {
  if (!items.length || count <= 0) return [];
  const start = Math.abs(seed) % items.length;
  const out: T[] = [];
  const n = Math.min(count, items.length);
  for (let i = 0; i < n; i++) out.push(items[(start + i) % items.length]);
  return out;
}

function clip(text: string, max = 400) {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > max ? clean.slice(0, max - 1) + '…' : clean;
}

export function planTemplate(input: {
  emp: EmpRef;
  phase: Exclude<WorkPhase, 'off'>;
  clockedIn: boolean;
  inboxOwner: InboxItem | null;
  inboxOther: InboxItem | null;
  colleague: InboxItem | null;
  task: TaskRef | null;
  pending: PendingRef | null;
  meeting: { id: string; title: string } | null;
}): Action[] {
  const { emp, phase } = input;
  const channel = deptChannel(emp.deptId);
  const skill = emp.skills[0] || '担当';
  const actions: Action[] = [];
  const push = (action: Action) => {
    if (actions.length < 2) actions.push(action);
  };

  if (phase === 'morning') {
    if (!input.clockedIn) push({ type: 'clock', action: 'in' });
    const focus = input.task ? `「${input.task.title}」` : `${skill}の仕込み`;
    push({
      type: 'post',
      channelId: channel,
      text: `おはようございます。${emp.name}です。今日は${focus}を進めます。`,
    });
    return actions;
  }

  if (phase === 'evening') {
    const done = input.task ? `「${input.task.title}」は${input.task.status === 'done' ? '完了' : '途中'}です。` : '今日の分は一区切りです。';
    push({ type: 'post', channelId: channel, text: `本日のまとめです。${done}退勤します。` });
    if (input.clockedIn) push({ type: 'clock', action: 'out' });
    return actions;
  }

  if (input.inboxOwner) {
    push({
      type: 'post',
      channelId: input.inboxOwner.channelId,
      parentId: input.inboxOwner.parentId || input.inboxOwner.messageId,
      text: `社長、確認しました。${skill}の観点で今日中に返します。`,
    });
  } else if (input.inboxOther) {
    push({
      type: 'post',
      channelId: input.inboxOther.channelId,
      parentId: input.inboxOther.parentId || input.inboxOther.messageId,
      text: `${input.inboxOther.fromName}さん、了解です。続きはこちらで進めます。`,
    });
  } else if (input.pending && (emp.role === 'manager' || emp.role === 'vp')) {
    const approve = input.pending.amount <= 30000 || input.pending.type === '休暇';
    push({
      type: 'decide',
      approvalId: input.pending.id,
      decision: approve ? 'approved' : 'rejected',
      reason: approve ? '内容を確認し、問題ないので承認します。' : '金額と根拠がまだ足りないので、一度差し戻します。',
    });
  }

  if (input.task && actions.length < 2) {
    const open = input.task.subtasks.find((s) => !s.done);
    if (open) push({ type: 'task', taskId: input.task.id, subtaskId: open.id, done: true, status: input.task.status === 'todo' ? 'doing' : undefined });
    else if (input.task.status === 'todo') push({ type: 'task', taskId: input.task.id, status: 'doing' });
    else if (input.task.status === 'doing') push({ type: 'task', taskId: input.task.id, status: 'review' });
    if (actions.every((a) => a.type !== 'post')) {
      push({ type: 'post', channelId: channel, text: `進捗です。「${input.task.title}」を進めています。` });
    }
  } else if (input.colleague && actions.length < 2) {
    push({ type: 'react', messageId: input.colleague.messageId, emoji: '👍' });
  } else if (input.meeting && actions.length < 2) {
    push({
      type: 'minutes',
      meetingId: input.meeting.id,
      text: `## メモ（${emp.name}）\n- ${input.meeting.title}の論点を確認\n- 次のアクションは担当タスクに落とす\n`,
    });
  } else if (actions.length < 2 && hash(`${emp.id}:${input.task?.id || 'none'}`) % 5 === 0) {
    push({
      type: 'approval',
      approvalType: '経費',
      title: `${skill}関連の消耗品`,
      amount: 3200 + (hash(emp.id) % 8) * 500,
      note: '制作で使う少額の消耗品です。',
      approverId: managerFor(emp),
    });
  }
  return actions.slice(0, 2).map((action) => (action.type === 'post' ? { ...action, text: clip(action.text) } : action));
}

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) >>> 0;
  return h;
}

const STATUSES = new Set(['todo', 'doing', 'review', 'done']);

export function sanitizeAction(raw: unknown, emp: EmpRef): Action | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const type = String(row.type || '');
  if (type === 'clock' && (row.action === 'in' || row.action === 'out')) return { type: 'clock', action: row.action };
  if (type === 'post' && typeof row.text === 'string' && typeof row.channelId === 'string') {
    return { type: 'post', channelId: row.channelId, text: clip(row.text), parentId: typeof row.parentId === 'string' ? row.parentId : undefined };
  }
  if (type === 'react' && typeof row.messageId === 'string' && typeof row.emoji === 'string') {
    return { type: 'react', messageId: row.messageId, emoji: row.emoji.slice(0, 8) };
  }
  if (type === 'task' && typeof row.taskId === 'string') {
    const status = typeof row.status === 'string' && STATUSES.has(row.status) ? row.status : undefined;
    return {
      type: 'task',
      taskId: row.taskId,
      status,
      subtaskId: typeof row.subtaskId === 'string' ? row.subtaskId : undefined,
      done: row.done === true,
      comment: typeof row.comment === 'string' ? clip(row.comment, 400) : undefined,
    };
  }
  if (type === 'approval' && typeof row.title === 'string') {
    const approvalType = row.approvalType === '稟議' || row.approvalType === '休暇' ? row.approvalType : '経費';
    return {
      type: 'approval',
      title: clip(row.title, 80),
      approvalType,
      amount: Math.max(0, Math.min(200000, Math.round(Number(row.amount) || 0))),
      note: clip(String(row.note || ''), 200),
      approverId: managerFor(emp),
    };
  }
  if (type === 'decide' && typeof row.approvalId === 'string' && (row.decision === 'approved' || row.decision === 'rejected')) {
    return { type: 'decide', approvalId: row.approvalId, decision: row.decision, reason: clip(String(row.reason || '確認しました。'), 160) };
  }
  if (type === 'minutes' && typeof row.meetingId === 'string' && typeof row.text === 'string') {
    return { type: 'minutes', meetingId: row.meetingId, text: clip(row.text, 800) };
  }
  if (type === 'doc' && typeof row.title === 'string' && typeof row.body === 'string') {
    return { type: 'doc', title: clip(row.title, 80), body: clip(row.body, 800), folderId: typeof row.folderId === 'string' ? row.folderId : 'f1' };
  }
  return null;
}
