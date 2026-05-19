import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

function uniqueFiles(files: string[]) {
  return Array.from(new Set(files.map((file) => path.resolve(file))));
}

function applyParsedEnv(
  parsed: Record<string, string>,
  options: { initialKeys: Set<string>; overrideLoaded: boolean }
) {
  for (const [key, value] of Object.entries(parsed)) {
    if (!options.overrideLoaded) {
      if (options.initialKeys.has(key)) continue;
      if (process.env[key] !== undefined) continue;
    }
    process.env[key] = value;
  }
}

function tryLoadEnvFile(
  filePath: string,
  options: { initialKeys: Set<string>; overrideLoaded: boolean }
) {
  if (!fs.existsSync(filePath)) return false;
  const content = fs.readFileSync(filePath, 'utf8');
  const parsed = dotenv.parse(content);
  applyParsedEnv(parsed, options);
  return true;
}

export function loadApiEnv() {
  const initialKeys = new Set(Object.keys(process.env));
  const cwd = process.cwd();
  const files = uniqueFiles([
    path.join(cwd, '.env'),
    path.join(cwd, '.env.local'),
    path.join(cwd, '../../.env'),
    path.join(cwd, '../../.env.local'),
  ]);

  const loaded: string[] = [];

  for (const filePath of files.filter((file) => file.endsWith('.env'))) {
    if (tryLoadEnvFile(filePath, { initialKeys, overrideLoaded: false })) {
      loaded.push(filePath);
    }
  }

  for (const filePath of files.filter((file) => file.endsWith('.env.local'))) {
    if (tryLoadEnvFile(filePath, { initialKeys, overrideLoaded: true })) {
      loaded.push(filePath);
    }
  }

  return loaded;
}
