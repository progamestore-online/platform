import type { FileSource } from './file-source.js';

/**
 * "Is this a game project?" — all projects in this repo are games,
 * but the check remains for compatibility with shared check logic.
 *
 * Detection signals (any one is sufficient):
 *   - `@progamestore/games` listed in any package.json
 *   - A TS/JS source file imports from `@progamestore/games`
 */
export async function isGameProject(source: FileSource): Promise<boolean> {
  for await (const path of source.list()) {
    const base = path.split('/').pop() ?? '';
    if (base !== 'package.json') continue;
    const content = await source.read(path);
    if (content && /@progamestore\/games/.test(content)) return true;
  }
  for await (const path of source.list()) {
    if (!path.endsWith('.ts') && !path.endsWith('.tsx')) continue;
    const content = await source.read(path);
    if (content && /from\s+['"]@progamestore\/games['"]/.test(content)) return true;
  }
  return false;
}
