/** Production and Vercel refuse a destructive reseed unless the owner opts in. */
export function resetAllowed(env: NodeJS.ProcessEnv = process.env) {
  const hosted = env.VERCEL === '1' || env.NODE_ENV === 'production';
  if (!hosted) return true;
  return env.ALLOW_SEED_RESET === 'true';
}
