import { spawn } from 'node:child_process';
import { buildDevChildEnv } from './load-dev-env.mjs';

const isWin = process.platform === 'win32';
const pnpmCmd = isWin ? (process.env.ComSpec || 'cmd.exe') : 'pnpm';
const childEnv = buildDevChildEnv(process.env, { isWindows: isWin });

function logDatabaseTarget(url) {
  if (typeof url !== 'string' || !url.trim()) {
    console.warn('[dev-trading] DATABASE_URL is not set for child processes');
    return;
  }
  try {
    const parsed = new URL(url);
    console.log(
      `[dev-trading] DATABASE_URL -> ${parsed.protocol}//${parsed.hostname}:${parsed.port || '5432'}${parsed.pathname}`
    );
  } catch {
    console.log('[dev-trading] DATABASE_URL appears to be set (unparseable URL format)');
  }
}

logDatabaseTarget(childEnv.DATABASE_URL);

const tasks = [
  { name: 'desktop-backend', command: 'pnpm run dev:desktop:backend' },
  { name: 'desktop-tauri', command: 'pnpm --filter trading-journal-desktop tauri:dev' },
];

const children = [];
let exiting = false;

function killAll(signal = 'SIGTERM') {
  if (exiting) return;
  exiting = true;
  for (const child of children) {
    if (!child.killed) {
      try {
        child.kill(signal);
      } catch {
        // ignore
      }
    }
  }
}

for (const task of tasks) {
  const args = isWin ? ['/d', '/s', '/c', task.command] : ['-lc', task.command];
  const shell = isWin ? pnpmCmd : 'bash';
  const child = spawn(shell, args, {
    stdio: 'inherit',
    shell: false,
    cwd: process.cwd(),
    env: childEnv,
    windowsHide: false,
  });
  children.push(child);

  child.on('exit', (code, signal) => {
    if (!exiting) {
      console.error(`[dev-trading] "${task.name}" exited (code=${code}, signal=${signal ?? 'none'})`);
      killAll();
      process.exit(code ?? 1);
    }
  });
}

process.on('SIGINT', () => {
  killAll('SIGINT');
  process.exit(0);
});

process.on('SIGTERM', () => {
  killAll('SIGTERM');
  process.exit(0);
});
