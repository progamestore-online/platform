import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { runChecks } from '@progamestore/compliance';
import { Command } from 'commander';
import prompts from 'prompts';
import { assertValidAppId } from '../lib/app-id.js';
import { readConfig } from '../lib/config.js';
import { renderCheckResults } from './check.js';

const CATEGORIES = [
  'Brain Training',
  'Arcade',
  'Strategy',
  'Sports',
  'Casual',
  'Cards',
  'Racing',
  'Other (specify in description)',
] as const;

const TYPES = [
  'Standalone (no backend, localStorage only)',
  'Connected (Firebase/Supabase backend, shared with Pro version)',
] as const;

interface SubmissionInput {
  name: string;
  category: (typeof CATEGORIES)[number];
  type: (typeof TYPES)[number];
  oneliner: string;
  repo: string | null;
  demo: string | null;
}

const STORE = 'games_pro' as const;
const META = {
  label: 'ProGameStore',
  domain: 'progamestore.online',
  org: 'progamestore-online',
} as const;

export const publishCommand = new Command('publish')
  .description('Publish this game to ProGameStore. Provisions repo + hosting + DNS automatically.')
  .option(
    '--skip-checks',
    'Skip compliance checks (not recommended — your submission may be rejected).',
  )
  .option('--name <id>', 'Game id (lowercase, used as subdomain). Skips the prompt.')
  .option(
    '--category <name>',
    'Category. Use exact label or its lowercased form (e.g. "strategy", "brain training"). Skips the prompt.',
  )
  .option('--type <kind>', 'Game type: "standalone" or "connected". Skips the prompt.')
  .option('--oneliner <text>', 'One-line description shown on the storefront. Skips the prompt.')
  .option('--demo <url>', 'Optional demo URL. Skips the prompt.')
  .option(
    '-y, --yes',
    'Non-interactive: fail rather than prompt for any missing fields. Pair with --name/--category/--type/--oneliner.',
  )
  .action(
    async (opts: {
      skipChecks?: boolean;
      name?: string;
      category?: string;
      type?: string;
      oneliner?: string;
      demo?: string;
      yes?: boolean;
    }) => {
      const config = await readConfig();
      if (!config.session?.token) {
        process.stdout.write('\nNot signed in. Run: pgs login\n');
        process.exit(1);
      }

      if (!opts.skipChecks) {
        process.stdout.write('Running compliance checks...\n\n');
        const results = await runChecks(process.cwd());
        const { failed } = renderCheckResults(results);
        if (failed > 0) {
          process.stdout.write(
            '\nFix the failures above before publishing, or pass --skip-checks to bypass.\n',
          );
          process.exit(1);
        }
        process.stdout.write('\n');
      }

      const repo = await detectGitRepo();
      const appName = await detectAppName();
      const description = await detectDescription();

      process.stdout.write(`\nPublishing to ${META.label}.\n`);

      const resolved = resolveFromFlags(opts);
      if (resolved.errors.length > 0) {
        for (const e of resolved.errors) process.stdout.write(`✗ ${e}\n`);
        process.exit(1);
      }

      if (opts.yes && resolved.values.demo === undefined) {
        resolved.values.demo = null;
      }

      const promptList = buildPromptList(resolved.values, { appName, description });
      const answers =
        promptList.length === 0
          ? {}
          : opts.yes
            ? (() => {
                const missing = promptList.map((p) => p.name).join(', ');
                process.stdout.write(`✗ --yes set but missing required field(s): ${missing}\n`);
                process.exit(1);
              })()
            : ((await prompts(promptList, {
                onCancel: () => {
                  process.stdout.write('\nCanceled.\n');
                  process.exit(1);
                },
              })) as Partial<SubmissionInput>);

      const merged: Partial<SubmissionInput> = { ...resolved.values, ...answers };
      const input: SubmissionInput = {
        name: merged.name!,
        category: merged.category!,
        type: merged.type!,
        oneliner: merged.oneliner!,
        repo: repo ? `https://github.com/${repo}` : null,
        demo: merged.demo?.trim() ? merged.demo : null,
      };

      const result = await provision(input, config.session.token, config.apiBase);
      if (result.kind === 'unauthorized') {
        process.stdout.write('\nSession expired. Run: pgs login\n');
        process.exit(1);
      }
      if (result.kind !== 'success') {
        process.stdout.write(`\nProvisioning failed: ${result.reason}\n`);
        process.exit(1);
      }

      process.stdout.write(`\nProvisioned!\n`);
      process.stdout.write(`  Live at:  ${result.appUrl}\n`);
      process.stdout.write(`  Repo:     ${result.repoUrl}\n`);
      process.stdout.write(`  Listing:  https://${META.domain}/games/${input.name}\n\n`);
      process.stdout.write(`Push your code:\n\n`);
      process.stdout.write(`  git remote add upstream ${result.repoUrl}.git\n`);
      process.stdout.write(`  git push upstream main\n\n`);
      process.stdout.write(`Future commits to main auto-deploy in ~30s.\n`);
      process.stdout.write(`Run \`pgs list\` any time to see your games.\n`);
    },
  );

interface ProvisionSuccess {
  kind: 'success';
  appUrl: string;
  repoUrl: string;
}
interface ProvisionFailure {
  kind: 'failed' | 'unauthorized';
  reason: string;
}
type ProvisionResult = ProvisionSuccess | ProvisionFailure;

async function provision(
  input: SubmissionInput,
  sessionToken: string,
  apiBase: string,
): Promise<ProvisionResult> {
  const typeShort = input.type.startsWith('Standalone') ? 'standalone' : 'connected';
  const res = await fetch(`${apiBase}/v1/publish`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${sessionToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: input.name,
      store: STORE,
      category: input.category,
      type: typeShort,
      oneliner: input.oneliner,
      repo: input.repo,
      demo: input.demo,
    }),
  });
  if (res.status === 401) return { kind: 'unauthorized', reason: 'session expired' };
  if (!res.ok) {
    const body = await res.text();
    return { kind: 'failed', reason: `${res.status}: ${body}` };
  }
  const result = (await res.json()) as { appUrl: string; repoUrl: string };
  return { kind: 'success', appUrl: result.appUrl, repoUrl: result.repoUrl };
}

export function resolveCategory(value: string): (typeof CATEGORIES)[number] | null {
  const normalized = value.trim().toLowerCase();
  for (const c of CATEGORIES) {
    if (c.toLowerCase() === normalized) return c;
  }
  if (normalized === 'other') return 'Other (specify in description)';
  return null;
}

export function resolveType(value: string): (typeof TYPES)[number] | null {
  const v = value.trim().toLowerCase();
  if (v === 'standalone' || v === TYPES[0].toLowerCase()) return TYPES[0];
  if (v === 'connected' || v === TYPES[1].toLowerCase()) return TYPES[1];
  return null;
}

interface ResolvedFlags {
  values: Partial<SubmissionInput>;
  errors: string[];
}

export function resolveFromFlags(opts: {
  name?: string;
  category?: string;
  type?: string;
  oneliner?: string;
  demo?: string;
}): ResolvedFlags {
  const values: Partial<SubmissionInput> = {};
  const errors: string[] = [];

  if (opts.name !== undefined) {
    try {
      assertValidAppId(opts.name);
      values.name = opts.name;
    } catch (e) {
      errors.push(e instanceof Error ? `--name: ${e.message}` : '--name invalid');
    }
  }
  if (opts.category !== undefined) {
    const c = resolveCategory(opts.category);
    if (c) values.category = c;
    else errors.push(`--category: not a known category. One of: ${CATEGORIES.join(', ')}`);
  }
  if (opts.type !== undefined) {
    const t = resolveType(opts.type);
    if (t) values.type = t;
    else errors.push('--type must be "standalone" or "connected"');
  }
  if (opts.oneliner !== undefined) {
    if (opts.oneliner.trim().length === 0) errors.push('--oneliner cannot be empty');
    else values.oneliner = opts.oneliner;
  }
  if (opts.demo !== undefined) {
    values.demo = opts.demo.trim() || null;
  }
  return { values, errors };
}

type PromptDef = prompts.PromptObject<string>;

export function buildPromptList(
  resolved: Partial<SubmissionInput>,
  defaults: { appName: string | null; description: string | null },
): PromptDef[] {
  const list: PromptDef[] = [];
  if (resolved.name === undefined) {
    list.push({
      type: 'text',
      name: 'name',
      message: 'Game id (lowercase, used as subdomain)',
      initial: defaults.appName ?? '',
      validate: (value: string) => {
        try {
          assertValidAppId(value);
          return true;
        } catch (e) {
          return e instanceof Error ? e.message : 'invalid';
        }
      },
    });
  }
  if (resolved.category === undefined) {
    list.push({
      type: 'select',
      name: 'category',
      message: 'Category',
      choices: CATEGORIES.map((c) => ({ title: c, value: c })),
    });
  }
  if (resolved.type === undefined) {
    list.push({
      type: 'select',
      name: 'type',
      message: 'Game type',
      choices: TYPES.map((t) => ({ title: t, value: t })),
    });
  }
  if (resolved.oneliner === undefined) {
    list.push({
      type: 'text',
      name: 'oneliner',
      message: 'One-line description (shown on the storefront)',
      initial: defaults.description ?? '',
      validate: (v: string) => v.trim().length > 0 || 'required',
    });
  }
  if (resolved.demo === undefined) {
    list.push({
      type: 'text',
      name: 'demo',
      message: 'Demo URL (optional, leave blank if none)',
    });
  }
  return list;
}

async function detectAppName(): Promise<string | null> {
  try {
    const raw = await readFile(join(process.cwd(), 'package.json'), 'utf8');
    const pkg = JSON.parse(raw) as { name?: string };
    return pkg.name ?? null;
  } catch {
    return null;
  }
}

async function detectDescription(): Promise<string | null> {
  try {
    const raw = await readFile(join(process.cwd(), 'package.json'), 'utf8');
    const pkg = JSON.parse(raw) as { description?: string };
    return pkg.description ?? null;
  } catch {
    return null;
  }
}

function detectGitRepo(): Promise<string | null> {
  return new Promise((resolveFn) => {
    const child = spawn('git', ['remote', 'get-url', 'origin'], {
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    let buf = '';
    child.stdout.on('data', (chunk: Buffer) => (buf += chunk.toString()));
    child.on('close', (code) => {
      if (code !== 0) resolveFn(null);
      else resolveFn(parseGitHubRepo(buf.trim()));
    });
    child.on('error', () => resolveFn(null));
  });
}

export function parseGitHubRepo(url: string): string | null {
  const m = /github\.com[:/]([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/.exec(url);
  if (!m?.[1] || !m[2]) return null;
  return `${m[1]}/${m[2]}`;
}
