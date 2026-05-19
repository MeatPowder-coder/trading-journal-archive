import fs from 'node:fs';
import path from 'node:path';

function sanitizeWindowsEnv(rawEnv) {
  const sanitized = {};
  for (const [key, value] of Object.entries(rawEnv)) {
    if (key.length === 0 || key.startsWith('=') || typeof value !== 'string') continue;
    // Windows env keys are case-insensitive; normalize to avoid duplicates
    // such as "Database_URL" vs "DATABASE_URL".
    sanitized[key.toUpperCase()] = value;
  }
  return sanitized;
}

function parseEnvContent(content) {
  const parsed = {};
  const lines = String(content || '')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/);

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

function summarizeDbSource(entries) {
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    const [filePath, parsed] = entries[i];
    const value = parsed?.DATABASE_URL;
    if (typeof value === 'string' && value.trim()) {
      return { filePath, value: value.trim() };
    }
  }
  return null;
}

export function buildDevChildEnv(baseEnv, { isWindows }) {
  const initial = isWindows ? sanitizeWindowsEnv(baseEnv) : { ...baseEnv };
  const cwd = process.cwd();

  const fileEntries = [
    [path.join(cwd, '.env'), readEnvFile(path.join(cwd, '.env'))],
    [path.join(cwd, '.env.local'), readEnvFile(path.join(cwd, '.env.local'))],
  ];

  const envFromFilesRaw = {};
  for (const [, parsed] of fileEntries) {
    Object.assign(envFromFilesRaw, parsed);
  }

  const envFromFiles = isWindows
    ? Object.fromEntries(
        Object.entries(envFromFilesRaw).map(([key, value]) => [key.toUpperCase(), value])
      )
    : envFromFilesRaw;

  // Dev scripts should prefer repository env files over machine/global vars,
  // otherwise stale DATABASE_URL (e.g. :15432) can break desktop login flow.
  const merged = {
    ...initial,
    ...envFromFiles,
  };

  if (typeof merged.DATABASE_URL === 'string' && merged.DATABASE_URL.trim().length > 0) {
    // Prevent inherited PG* vars from overriding/fallback behavior when a URL is present.
    delete merged.PGHOST;
    delete merged.PGHOSTADDR;
    delete merged.PGPORT;
    delete merged.PGUSER;
    delete merged.PGPASSWORD;
    delete merged.PGDATABASE;
    delete merged.PGSSLMODE;
    delete merged.PGSERVICE;
  }

  const dbSource = summarizeDbSource(fileEntries);
  if (dbSource) {
    console.log(`[dev-env] DATABASE_URL loaded from ${dbSource.filePath}`);
  } else if (typeof merged.DATABASE_URL === 'string' && merged.DATABASE_URL.trim().length > 0) {
    console.log('[dev-env] DATABASE_URL comes from inherited process environment');
  } else {
    console.warn('[dev-env] DATABASE_URL is missing in both .env/.env.local and process env');
  }

  return merged;
}
