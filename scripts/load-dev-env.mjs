import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

function sanitizeWindowsEnv(rawEnv) {
  return Object.fromEntries(
    Object.entries(rawEnv).filter(
      ([key, value]) => key.length > 0 && !key.startsWith('=') && typeof value === 'string'
    )
  );
}

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const content = fs.readFileSync(filePath, 'utf8');
  return dotenv.parse(content);
}

export function buildDevChildEnv(baseEnv, { isWindows }) {
  const initial = isWindows ? sanitizeWindowsEnv(baseEnv) : { ...baseEnv };
  const cwd = process.cwd();

  const envFromFiles = {
    ...readEnvFile(path.join(cwd, '.env')),
    ...readEnvFile(path.join(cwd, '.env.local')),
  };

  // Dev scripts should prefer repository env files over machine/global vars,
  // otherwise stale DATABASE_URL (e.g. :15432) can break desktop login flow.
  return {
    ...initial,
    ...envFromFiles,
  };
}

