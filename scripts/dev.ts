import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync } from 'node:fs';

if (!existsSync('.env')) copyFileSync('.env.example', '.env');

function run(cmd: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: 'inherit' });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(' ')} exited ${code}`))));
  });
}

const docker = spawnSync('docker', ['compose', 'up', '-d'], { stdio: 'inherit' });
if (docker.error || docker.status) {
  console.warn('docker compose を起動できませんでした。DATABASE_URL の Postgres が起動済みであることを確認してください。');
}

await run('npx', ['prisma', 'generate']);
await run('npx', ['prisma', 'migrate', 'deploy']);
await run('npx', ['tsx', 'prisma/seed.ts']);

const port = process.env.PORT || '3000';
const next = spawn('npx', ['next', 'dev', '-p', port], { stdio: 'inherit' });
next.on('exit', (code) => process.exit(code ?? 0));
process.on('SIGINT', () => next.kill('SIGINT'));
process.on('SIGTERM', () => next.kill('SIGTERM'));
