import { db } from '../src/lib/prisma';
import { seedDatabase } from '../src/lib/seed-run';

const reset = process.argv.includes('--reset');
const demo = process.argv.includes('--demo');
seedDatabase({ reset, demo })
  .then(async (r) => {
    const mode = r.demo ? 'demo' : 'clean';
    console.log(r.skipped ? 'seed: already up to date' : `seed: ${mode}, inserted ${r.users} users`);
    await db().$disconnect();
  })
  .catch(async (err) => {
    console.error(err);
    await db().$disconnect().catch(() => undefined);
    process.exit(1);
  });
