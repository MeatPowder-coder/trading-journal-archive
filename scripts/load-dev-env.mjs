import fs from 'node:fs';
import path from 'node:path';

function sanitizeWindowsEnv(rawEnv) {
  return Object.fromEntries(
    Object.entries(rawEnv).filter(
      ([key, value]) => key.length > 0 && !key.startsWith('=') && typeof value === 'string'
    )
  );
}

function parseEnvContent(content) {
  const parsed = {};
  const lines = String(content || '').split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const normalized = line.startsWith('export ') ? line.slice(7).trim() : line;
    const eqIndex = normalized.indexOf('=');
    if (eqIndex <= 0) continue;

    const key = normalized.slice(0, eqIndex).trim();
    if (!key) continue;

    let value = normalized.slice(eqIndex + 1).trim();
    if (!value) {
      parsed[key] = '';
      continue;
    }

    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      value = value.slice(1, -1);
    } else {
      const hashIndex = value.indexOf(' #');
      if (hashIndex >= 0) value = value.slice(0, hashIndex).trim();
    }

    parsed[key] = value;
  }

  return parsed;
}

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const content = fs.readFileSync(filePath, 'utf8');
  return parseEnvContent(content);
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
