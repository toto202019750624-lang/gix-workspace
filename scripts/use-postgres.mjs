import { readFileSync, writeFileSync } from 'node:fs';

const file = 'prisma/schema.prisma';
const src = readFileSync(file, 'utf8');
if (src.includes('provider = "postgresql"')) {
  console.log('schema is already postgresql');
  process.exit(0);
}
const next = src.replace('provider = "sqlite"', 'provider = "postgresql"');
if (next === src) {
  console.error('provider line not found');
  process.exit(1);
}
writeFileSync(file, next);
console.log('Switched prisma/schema.prisma to postgresql.');
console.log('Set DATABASE_URL to your hosted Postgres URL, then run: npx prisma db push && npx tsx prisma/seed.ts');
