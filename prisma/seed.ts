import { seedDatabase } from '../src/lib/seed-run';

const reset = process.argv.includes('--reset');
seedDatabase({ reset })
  .then((r) => {
    console.log(r.skipped ? 'seed: already up to date' : `seed: inserted ${r.users} users`);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
