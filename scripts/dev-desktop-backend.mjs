import { spawn } from 'node:child_process';

const isWin = process.platform === 'win32';
const pnpmCmd = isWin ? 'pnpm.cmd' : 'pnpm';

const tasks = [
  { name: 'journal', args: ['dev:journal'] },
  { name: 'api', args: ['dev:api'] },
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
  const child = spawn(pnpmCmd, task.args, {
    stdio: 'inherit',
    shell: false,
    env: process.env,
  });
  children.push(child);

  child.on('exit', (code, signal) => {
    if (!exiting) {
      console.error(`[desktop-backend] "${task.name}" exited (code=${code}, signal=${signal ?? 'none'})`);
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
