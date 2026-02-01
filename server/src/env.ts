import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

const ENV_LOADED_KEY = '__WANDR_ENV_LOADED';

export function loadEnv(): void {
  if (process.env[ENV_LOADED_KEY]) return;

  const cwd = process.cwd();
  const rootCandidate = path.resolve(cwd, '.env');
  const parentCandidate = path.resolve(cwd, '..', '.env');
  const isRepoRoot = fs.existsSync(path.join(cwd, 'client')) && fs.existsSync(path.join(cwd, 'server'));

  let envPath: string | undefined;
  if (isRepoRoot) {
    envPath = fs.existsSync(rootCandidate) ? rootCandidate : undefined;
  } else if (fs.existsSync(parentCandidate)) {
    envPath = parentCandidate;
  } else if (fs.existsSync(rootCandidate)) {
    envPath = rootCandidate;
  }

  if (envPath) {
    dotenv.config({ path: envPath });
  } else {
    dotenv.config();
  }

  process.env[ENV_LOADED_KEY] = 'true';
}
