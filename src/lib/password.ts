import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export const DEMO_PASSWORD = 'gix2026';

export function hashPassword(password: string, salt = randomBytes(16).toString('hex')) {
  const hash = scryptSync(password, salt, 32).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string) {
  const [kind, salt, hash] = stored.split('$');
  if (kind !== 'scrypt' || !salt || !hash) return false;
  const actual = scryptSync(password, salt, 32);
  const expected = Buffer.from(hash, 'hex');
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

let demoHash: string | null = null;
export function demoPasswordHash() {
  if (!demoHash) demoHash = hashPassword(DEMO_PASSWORD, 'gixworkspaceseed01');
  return demoHash;
}
