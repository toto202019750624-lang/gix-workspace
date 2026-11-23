import { spawn } from 'node:child_process';
import { copyFileSync, existsSync } from 'node:fs';

if (!existsSync('.env') && existsSync('.env.example')) copyFileSync('.env.example', '.env');

function run(cmd: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: 'inherit' });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
  });
}

await run('npx', ['prisma', 'migrate', 'deploy']);
await run('npx', ['tsx', 'prisma/seed.ts']);
const port = process.env.PORT || '3000';
const next = spawn('npx', ['next', 'start', '-p', port], { stdio: 'inherit' });
next.on('exit', (code) => process.exit(code ?? 0));
