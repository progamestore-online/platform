import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { type CheckResult, runChecks } from '@progamestore/compliance';
import { Command } from 'commander';

/**
 * Find the game's repo root by walking up from `start` looking for the
 * marker files every scaffolded game has at root. Returns `start` if no
 * marker is found (so `--dir` can still target an arbitrary directory).
 *
 * Why: `pnpm build` runs the prebuild hook with cwd=`web/`, but the
 * compliance checks expect to find `LICENSE`, `web/index.html`, etc.
 * relative to the repo root. Walking up makes `fgs check` work from
 * either the root or a `web/` subdir without callers having to pass
 * `--dir ..`.
 */
function findGameRoot(start: string): string {
  let dir = resolve(start);
  const stop = '/';
  while (dir !== stop) {
    if (existsSync(resolve(dir, 'pnpm-workspace.yaml')) || existsSync(resolve(dir, 'LICENSE'))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return resolve(start);
}

const isTTY = Boolean(process.stdout.isTTY) && process.env.NO_COLOR !== '1';
const c = (open: string) => (s: string) => (isTTY ? `\x1b[${open}m${s}\x1b[39m` : s);
const green = c('32');
const yellow = c('33');
const red = c('31');
const dim = (s: string) => (isTTY ? `\x1b[2m${s}\x1b[22m` : s);
const bold = (s: string) => (isTTY ? `\x1b[1m${s}\x1b[22m` : s);

const ICON: Record<CheckResult['status'], string> = {
  pass: '✓',
  warn: '!',
  fail: '✗',
};

const COLOR: Record<CheckResult['status'], (s: string) => string> = {
  pass: green,
  warn: yellow,
  fail: red,
};

export interface CheckSummary {
  failed: number;
  warned: number;
  passed: number;
}

/**
 * Print compliance results in the standard format. Reused by `fas check`
 * and by `fas publish`'s pre-flight gate so output stays identical.
 */
export function renderCheckResults(results: CheckResult[]): CheckSummary {
  let failed = 0;
  let warned = 0;
  let passed = 0;
  for (const r of results) {
    const icon = COLOR[r.status](ICON[r.status]);
    process.stdout.write(`${icon}  ${bold(r.name.padEnd(28))} ${dim(r.detail)}\n`);
    if (r.suggestions && r.suggestions.length > 0 && r.status !== 'pass') {
      for (const s of r.suggestions) {
        process.stdout.write(`     ${dim('→')} ${dim(s)}\n`);
      }
    }
    if (r.status === 'fail') failed++;
    else if (r.status === 'warn') warned++;
    else passed++;
  }

  process.stdout.write('\n');
  if (failed > 0) {
    process.stdout.write(red(`✗ ${failed} failed`));
  } else {
    process.stdout.write(green(`✓ all hard checks passed`));
  }
  if (warned > 0) {
    process.stdout.write(yellow(`, ${warned} warning${warned === 1 ? '' : 's'}`));
  }
  process.stdout.write('\n');

  return { failed, warned, passed };
}

export const checkCommand = new Command('check')
  .description('Run compliance checks + VibeCode QA code health scan.')
  .option('--dir <path>', 'Directory to check', process.cwd())
  .option('--skip-vcqa', 'Skip VibeCode QA scan (compliance only).')
  .action(async (opts: { dir: string; skipVcqa?: boolean }) => {
    const root = findGameRoot(opts.dir);

    // 1. Platform compliance checks
    process.stdout.write(bold('Platform compliance\n\n'));
    const results = await runChecks(root);
    const { failed } = renderCheckResults(results);

    // 2. VibeCode QA code health scan
    if (!opts.skipVcqa) {
      process.stdout.write(`\n${bold('VibeCode QA')}\n\n`);
      try {
        execSync('npx -y @vibecodeqa/cli@latest --skip-tests', {
          cwd: root,
          stdio: 'inherit',
        });
      } catch {
        process.stdout.write(yellow('  vcqa scan failed or scored below threshold\n'));
      }
    }

    if (failed > 0) process.exit(1);
  });
