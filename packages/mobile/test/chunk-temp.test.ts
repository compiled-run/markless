import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { CHUNK_TEMP_PREFIX, withChunkTempDir } from '../src/runner/chunk-temp.ts';

const roots: string[] = [];
const root = () => {
	const dir = mkdtempSync(join(tmpdir(), 'chunk-temp-root-'));
	roots.push(dir);
	return dir;
};
afterEach(() => {
	for (const dir of roots.splice(0)) rmSync(dir, { recursive: true, force: true });
});

test('what a chunk and the tools it starts make in their temp folder is gone after the chunk', async () => {
	const at = root();
	let made = '';
	await withChunkTempDir(
		{ PATH: process.env.PATH, JAVA_TOOL_OPTIONS: '-Xmx1g' },
		async (env) => {
			expect(env.TMPDIR?.startsWith(join(at, CHUNK_TEMP_PREFIX))).toBe(true);
			expect(env.JAVA_TOOL_OPTIONS).toBe(`-Xmx1g -Djava.io.tmpdir=${env.TMPDIR}`);
			const child = spawnSync(
				process.execPath,
				['-e', "const fs = require('node:fs'), os = require('node:os'), path = require('node:path'); for (const p of ['maestro_xctestrunner_xcodebuild', 'TemporaryDirectory.']) console.log(fs.mkdtempSync(path.join(os.tmpdir(), p)))"],
				{ env, encoding: 'utf8' },
			);
			made = child.stdout;
		},
		at,
	);
	const folders = made.trim().split('\n');
	expect(folders).toHaveLength(2);
	for (const folder of folders) expect(existsSync(folder)).toBe(false);
	expect(readdirSync(at)).toEqual([]);
});

test('a chunk that fails still removes its temp folder', async () => {
	const at = root();
	await expect(
		withChunkTempDir({}, async () => {
			throw new Error('the phone went away');
		}, at),
	).rejects.toThrow('the phone went away');
	expect(readdirSync(at)).toEqual([]);
});
