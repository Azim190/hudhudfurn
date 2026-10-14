import { execSync } from 'node:child_process';
import { join } from 'node:path';

/** Apply migrations to the test database once per run. */
export default function globalSetup(): void {
  require('./setup-env');
  execSync('npx prisma migrate deploy', {
    cwd: join(__dirname, '..'),
    env: process.env,
    stdio: 'pipe',
  });
}
