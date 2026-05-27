import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const CONFIG_DIR = join(homedir(), '.pgs');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

export interface PgsConfig {
  apiBase: string;
  github?: {
    accessToken: string;
    login: string;
    obtainedAt: number;
  };
  session?: {
    token: string;
    obtainedAt: number;
  };
}

const DEFAULT_CONFIG: PgsConfig = {
  apiBase: process.env.PGS_API_BASE ?? 'https://admin.progamestore.online',
};

export function normalizeApiBase(s: string): string {
  return s.replace(/\/+$/, '');
}

export async function readConfig(): Promise<PgsConfig> {
  try {
    const raw = await readFile(CONFIG_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<PgsConfig>;
    const merged = { ...DEFAULT_CONFIG, ...parsed };
    return { ...merged, apiBase: normalizeApiBase(merged.apiBase) };
  } catch {
    return { ...DEFAULT_CONFIG, apiBase: normalizeApiBase(DEFAULT_CONFIG.apiBase) };
  }
}

export async function writeConfig(config: PgsConfig): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true, mode: 0o700 });
  await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), { mode: 0o600 });
  await chmod(CONFIG_FILE, 0o600);
}
