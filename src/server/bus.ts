import { EventEmitter } from 'node:events';

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

export function publish(event: GixEvent) {
  bus.emit('gix', event);
}
