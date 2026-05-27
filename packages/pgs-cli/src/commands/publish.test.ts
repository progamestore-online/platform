import { describe, expect, it } from 'vitest';
import {
  buildPromptList,
  parseGitHubRepo,
  resolveCategory,
  resolveFromFlags,
  resolveType,
} from './publish.js';

describe('parseGitHubRepo', () => {
  it('parses HTTPS clone URLs', () => {
    expect(parseGitHubRepo('https://github.com/foo/bar')).toBe('foo/bar');
    expect(parseGitHubRepo('https://github.com/foo/bar.git')).toBe('foo/bar');
    expect(parseGitHubRepo('https://github.com/foo/bar/')).toBe('foo/bar');
    expect(parseGitHubRepo('https://github.com/foo/bar.git/')).toBe('foo/bar');
  });

  it('parses SSH clone URLs', () => {
    expect(parseGitHubRepo('git@github.com:foo/bar.git')).toBe('foo/bar');
    expect(parseGitHubRepo('git@github.com:foo/bar')).toBe('foo/bar');
  });

  it('allows dots in repo names (e.g. node.js, foo.config)', () => {
    expect(parseGitHubRepo('https://github.com/nodejs/node.js')).toBe('nodejs/node.js');
    expect(parseGitHubRepo('git@github.com:nodejs/node.js.git')).toBe('nodejs/node.js');
  });

  it('allows hyphens, underscores, and digits', () => {
    expect(parseGitHubRepo('https://github.com/foo-bar/baz_qux-2')).toBe('foo-bar/baz_qux-2');
  });

  it('returns null for non-GitHub URLs', () => {
    expect(parseGitHubRepo('https://gitlab.com/foo/bar')).toBeNull();
    expect(parseGitHubRepo('https://example.com/repo')).toBeNull();
    expect(parseGitHubRepo('not a url')).toBeNull();
    expect(parseGitHubRepo('')).toBeNull();
  });
});

describe('resolveCategory', () => {
  it('matches exact label', () => {
    expect(resolveCategory('Arcade')).toBe('Arcade');
  });
  it('matches case-insensitive', () => {
    expect(resolveCategory('strategy')).toBe('Strategy');
    expect(resolveCategory('STRATEGY')).toBe('Strategy');
    expect(resolveCategory('  Brain Training  ')).toBe('Brain Training');
  });
  it('matches "other" short form', () => {
    expect(resolveCategory('other')).toBe('Other (specify in description)');
  });
  it('returns null for unknown', () => {
    expect(resolveCategory('nope')).toBeNull();
    expect(resolveCategory('')).toBeNull();
  });
});

describe('resolveType', () => {
  it('matches short forms', () => {
    expect(resolveType('standalone')).toBe('Standalone (no backend, localStorage only)');
    expect(resolveType('connected')).toBe(
      'Connected (Firebase/Supabase backend, shared with Pro version)',
    );
  });
  it('matches case-insensitive full label', () => {
    expect(resolveType('STANDALONE')).toBe('Standalone (no backend, localStorage only)');
  });
  it('returns null for unknown', () => {
    expect(resolveType('something')).toBeNull();
  });
});

describe('resolveFromFlags', () => {
  it('returns empty values when no flags supplied', () => {
    const r = resolveFromFlags({});
    expect(r.values).toEqual({});
    expect(r.errors).toEqual([]);
  });
  it('resolves valid combinations', () => {
    const r = resolveFromFlags({
      name: 'my-game',
      category: 'arcade',
      type: 'standalone',
      oneliner: 'Does a thing',
      demo: 'https://demo.example',
    });
    expect(r.errors).toEqual([]);
    expect(r.values.name).toBe('my-game');
    expect(r.values.category).toBe('Arcade');
    expect(r.values.type).toBe('Standalone (no backend, localStorage only)');
    expect(r.values.oneliner).toBe('Does a thing');
    expect(r.values.demo).toBe('https://demo.example');
  });
  it('treats blank --demo as null', () => {
    const r = resolveFromFlags({ demo: '   ' });
    expect(r.values.demo).toBeNull();
  });
  it('rejects invalid app id', () => {
    const r = resolveFromFlags({ name: 'BadName' });
    expect(r.errors[0]).toMatch(/--name/);
    expect(r.values.name).toBeUndefined();
  });
  it('rejects unknown category and type', () => {
    const r = resolveFromFlags({ category: 'nope', type: 'foo' });
    expect(r.errors).toHaveLength(2);
  });
  it('rejects empty oneliner', () => {
    const r = resolveFromFlags({ oneliner: '   ' });
    expect(r.errors[0]).toMatch(/oneliner/);
  });
});

describe('buildPromptList', () => {
  const defaults = { appName: null, description: null };
  it('returns all 5 prompts when nothing resolved', () => {
    expect(buildPromptList({}, defaults).map((p) => p.name)).toEqual([
      'name',
      'category',
      'type',
      'oneliner',
      'demo',
    ]);
  });
  it('skips a prompt when its value is already resolved', () => {
    const list = buildPromptList(
      { name: 'my-game', category: 'Arcade', type: 'Standalone (no backend, localStorage only)' },
      defaults,
    );
    expect(list.map((p) => p.name)).toEqual(['oneliner', 'demo']);
  });
  it('returns empty list when everything resolved', () => {
    expect(
      buildPromptList(
        {
          name: 'x',
          category: 'Arcade',
          type: 'Standalone (no backend, localStorage only)',
          oneliner: 'y',
          demo: null,
        },
        defaults,
      ),
    ).toEqual([]);
  });
});
