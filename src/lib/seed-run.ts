import { randomUUID } from 'node:crypto';
import { db } from './prisma';
import { demoPasswordHash } from './password';
import { buildSeed, orgOnly } from './seed-data';
import { todayYMD } from './dates';
import { resetAllowed } from './seed-guard';

type Tx = Omit<ReturnType<typeof db>, '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'>;

/** Messages, tasks, approvals, and the rest of the working data. People and channels stay. */
export async function clearBusinessData(prisma: Tx) {
  await prisma.taskComment.deleteMany();
  await prisma.aiActivity.deleteMany();
  await prisma.realtimeEvent.deleteMany();
  await prisma.reaction.deleteMany();
  await prisma.attachment.deleteMany();
  await prisma.message.updateMany({ data: { parentId: null } });
  await prisma.message.deleteMany();
  await prisma.channelRead.deleteMany();
  await prisma.eventAttendee.deleteMany();
  await prisma.calendarEvent.deleteMany();
  await prisma.subtask.deleteMany();
  await prisma.task.deleteMany();
  await prisma.doc.deleteMany();
  await prisma.folder.deleteMany();
  await prisma.baseRow.deleteMany();
  await prisma.approvalStep.deleteMany();
  await prisma.approval.deleteMany();
  await prisma.meetingAttendee.deleteMany();
  await prisma.meeting.deleteMany();
  await prisma.attendance.deleteMany();
  await prisma.keyResult.deleteMany();
  await prisma.okr.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.announcement.deleteMany();
}

async function wipe() {
  const prisma = db();
  await clearBusinessData(prisma);
  await prisma.appSetting.deleteMany();
  await prisma.channelMember.deleteMany();
  await prisma.channel.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
  await prisma.department.deleteMany();
  await prisma.company.deleteMany();
}

/** Idempotent wipe of working data on a live database. Does not touch users, departments, or channels. */
export async function resetBusinessData() {
  const prisma = db();
  await prisma.$transaction(async (tx) => {
    await clearBusinessData(tx);
  }, { timeout: 20_000 });
  const [users, departments, channels, messages, tasks] = await Promise.all([
    prisma.user.count(),
    prisma.department.count(),
    prisma.channel.count(),
    prisma.message.count(),
    prisma.task.count(),
  ]);
  return { ok: true as const, users, departments, channels, messages, tasks };
}

export async function seedDatabase(opts: { reset?: boolean; demo?: boolean; today?: string } = {}) {
  const prisma = db();
  if (opts.reset && !resetAllowed()) {
    throw new Error('本番環境では ALLOW_SEED_RESET=true を明示しない限りデータを初期化できません');
  }
  const existing = await prisma.company.findUnique({ where: { id: 'gix' } }).catch(() => null);
  const userCount = await prisma.user.count().catch(() => 0);
  if (!opts.reset && (existing || userCount > 0)) {
    return { skipped: true as const, demo: !!opts.demo };
  }
  if (existing || userCount) await wipe();

  const now = Date.now();
  const today = opts.today || todayYMD(new Date(now));
  const data = opts.demo ? buildSeed(today) : orgOnly(buildSeed(today));
  const at = (minutesAgo: number) => new Date(now - minutesAgo * 60000);
  const passwordHash = demoPasswordHash();

  await prisma.company.create({ data: data.company });
  await prisma.department.createMany({ data: data.departments });
  for (const [i, u] of data.users.entries()) {
    await prisma.user.create({
      data: {
        id: u.id,
        email: `${u.id}@gix.example`,
        passwordHash,
        name: u.name,
        deptId: u.deptId,
        role: u.role,
        title: u.title,
        skills: JSON.stringify(u.skills),
        bio: u.bio,
        ext: '0' + (100 + i),
        status: u.status || 'online',
        grad: u.grad || null,
        isBot: !!u.isBot,
      },
    });
  }
  for (const c of data.channels) {
    await prisma.channel.create({
      data: {
        id: c.id,
        name: c.name,
        kind: c.kind,
        desc: c.desc,
        sort: c.sort,
        members: { create: c.memberIds.map((userId) => ({ userId })) },
      },
    });
  }
  for (const m of data.messages) {
    await prisma.message.create({
      data: {
        id: m.id,
        channelId: m.channelId,
        userId: m.userId,
        text: m.text,
        createdAt: at(m.minutesAgo),
        reactions: {
          create: Object.entries(m.reactions || {}).flatMap(([emoji, users]) => users.map((userId) => ({ userId, emoji }))),
        },
      },
    });
    for (const r of m.replies || []) {
      await prisma.message.create({
        data: {
          id: r.id,
          channelId: m.channelId,
          userId: r.userId,
          text: r.text,
          parentId: m.id,
          createdAt: at(r.minutesAgo),
          reactions: {
            create: Object.entries(r.reactions || {}).flatMap(([emoji, users]) => users.map((userId) => ({ userId, emoji }))),
          },
        },
      });
    }
  }

  const readNow = new Date(now);
  for (const c of data.channels) {
    for (const userId of c.memberIds) {
      const ov = data.readOverrides.find((r) => r.userId === userId && r.channelId === c.id);
      await prisma.channelRead.create({
        data: { channelId: c.id, userId, lastReadAt: ov ? at(ov.minutesAgo) : readNow },
      });
    }
  }

  for (const e of data.events) {
    await prisma.calendarEvent.create({
      data: {
        id: e.id,
        title: e.title,
        date: e.date,
        start: e.start,
        end: e.end,
        color: e.color,
        place: e.place,
        desc: e.desc,
        createdById: 'chima',
        attendees: { create: e.attendees.map((userId) => ({ userId })) },
      },
    });
  }
  for (const t of data.tasks) {
    await prisma.task.create({
      data: {
        id: t.id,
        title: t.title,
        status: t.status,
        assigneeId: t.assigneeId,
        creatorId: t.creatorId,
        start: t.start,
        due: t.due,
        priority: t.priority,
        tag: t.tag,
        sort: t.sort,
        subtasks: { create: t.subtasks.map((s, i) => ({ title: s.title, done: s.done, sort: i })) },
      },
    });
  }
  await prisma.folder.createMany({ data: data.folders });
  for (const d of data.docs) {
    await prisma.doc.create({ data: d });
  }
  await prisma.baseRow.createMany({ data: data.base });
  for (const [i, a] of data.approvals.entries()) {
    await prisma.approval.create({
      data: {
        id: a.id,
        type: a.type,
        title: a.title,
        amount: a.amount,
        requesterId: a.requesterId,
        date: a.date,
        status: a.status,
        note: a.note,
        createdAt: new Date(now - i * 1000),
        steps: {
          create: a.steps.map((s) => ({
            approverId: s.approverId,
            position: s.position,
            status: s.status,
            decidedAt: s.status === 'pending' || s.status === 'waiting' ? null : at(60 * 24),
          })),
        },
      },
    });
  }
  for (const m of data.meetings) {
    await prisma.meeting.create({
      data: {
        id: m.id,
        title: m.title,
        date: m.date,
        time: m.time,
        status: m.status,
        minutes: m.minutes,
        attendees: { create: m.attendees.map((userId) => ({ userId })) },
      },
    });
  }
  for (const o of data.okrs) {
    await prisma.okr.create({
      data: {
        id: o.id,
        ownerId: o.ownerId,
        objective: o.objective,
        krs: { create: o.krs.map((k, i) => ({ ...k, sort: i })) },
      },
    });
  }
  for (const n of data.notifications) {
    await prisma.notification.create({
      data: {
        id: n.id,
        userId: n.userId,
        icon: n.icon,
        text: n.text,
        read: n.read,
        go: n.go,
        createdAt: new Date(now - n.ageMs),
      },
    });
  }
  for (const [i, a] of data.announcements.entries()) {
    await prisma.announcement.create({ data: { ...a, createdAt: new Date(now - i * 1000) } });
  }
  for (const row of data.attendance) {
    await prisma.attendance.create({ data: { id: randomUUID(), ...row } });
  }
  return { skipped: false as const, demo: !!opts.demo, users: data.users.length };
}
