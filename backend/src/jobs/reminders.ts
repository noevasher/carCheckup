/**
 * CLI for scheduled runs (e.g. a Render Cron Job every hour): `npm run job:reminders -w backend`.
 * Prints the run summary as JSON; exits with code 1 if the run itself failed.
 */
import { prisma } from '../lib/prisma';
import { runReminders } from '../modules/reminders/run-reminders';

runReminders({ budgetMs: 55 * 60 * 1000 })
  .then((result) => {
    console.log(JSON.stringify(result));
  })
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
