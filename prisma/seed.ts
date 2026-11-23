import { db } from '../src/lib/prisma';
import { seedDatabase } from '../src/lib/seed-run';

const reset = process.argv.includes('--reset');
seedDatabase({ reset })
  .then(async (r) => {
    console.log(r.skipped ? 'seed: already up to date' : `seed: inserted ${r.users} users`);
    await db().$disconnect();
  })
  .catch(async (err) => {
    console.error(err);
    await db().$disconnect().catch(() => undefined);
    process.exit(1);
  });
