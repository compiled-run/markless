import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { pruneCompileCache } from './node-compile-cache.ts';

const scratch: string[] = [];
afterEach(() => {
	for (const directory of scratch.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function cacheWith(entriesPerVersion: Record<string, number>): string {
	const directory = mkdtempSync(join(tmpdir(), 'markless-compile-cache-'));
	scratch.push(directory);
	for (const [version, entries] of Object.entries(entriesPerVersion)) {
		mkdirSync(join(directory, version));
		for (let index = 0; index < entries; index++)
			writeFileSync(join(directory, version, `entry-${index}`), '');
	}
	return directory;
}

test('a cache within its bound is kept', () => {
	const directory = cacheWith({ 'v24.0.0-x64': 3, 'v24.1.0-x64': 2 });
	pruneCompileCache(directory, 5);
	expect(readdirSync(directory).sort()).toEqual(['v24.0.0-x64', 'v24.1.0-x64']);
});

test('a cache past its bound, counted across Node versions, is emptied', () => {
	const directory = cacheWith({ 'v24.0.0-x64': 3, 'v24.1.0-x64': 3 });
	pruneCompileCache(directory, 5);
	expect(() => readdirSync(directory)).toThrow(/ENOENT/);
});

test('a missing cache directory is left alone', () => {
	expect(() =>
		pruneCompileCache(join(tmpdir(), 'markless-compile-cache-missing'), 5),
	).not.toThrow();
});
