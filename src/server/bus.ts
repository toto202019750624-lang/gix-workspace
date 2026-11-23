import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { db } from '../lib/prisma';

export type GixEvent = {
  type: 'message' | 'notification' | 'approval' | 'task' | 'attendance' | 'hello';
  channelId?: string;
  userId?: string;
};

const g = globalThis as unknown as { __gixBus?: EventEmitter };
if (!g.__gixBus) {
  g.__gixBus = new EventEmitter();
  g.__gixBus.setMaxListeners(500);
}

export const bus = g.__gixBus;

/** sse on a long-lived Node process, poll on Vercel / multi-instance. */
export function realtimeMode(): 'sse' | 'poll' {
  const explicit = (process.env.REALTIME_MODE || 'auto').toLowerCase();
  if (explicit === 'poll' || explicit === 'sse') return explicit;
  if (process.env.VERCEL === '1') return 'poll';
  return 'sse';
}

export function publish(event: GixEvent) {
  bus.emit('gix', event);
  if (event.type === 'hello') return;
  void persistEvent(event);
}

async function persistEvent(event: GixEvent) {
  try {
    await db().realtimeEvent.create({
      data: {
        id: randomUUID(),
        type: event.type,
        channelId: event.channelId || '',
        userId: event.userId || '',
        createdAt: new Date(),
      },
    });
    if (Math.random() < 0.08) {
      await db().realtimeEvent.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 60 * 60 * 1000) } } });
    }
  } catch (error) {
    console.error('realtime persist failed', error);
  }
}
